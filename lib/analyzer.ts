import { chromium } from 'playwright';
import path from 'path';
import pLimit from 'p-limit';
import { AnalysisResult } from '@/types';
import { ensureScreenshotsDir } from './storage';

const CMS_ENV = process.env.CMS_ENV || 'test';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';
const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';

const CONCURRENCY = 5;

const API_BASE = {
  test: 'https://v2.api.test.codmos.io',
  prod: 'https://v2.api.codmos.io',
};

const CDN_DOMAIN = {
  test: 'v2.cdn.test.codmos.io',
  prod: 'v2.cdn.codmos.io',
};

interface CookieSpec {
  name: string;
  value: string;
  domain: string;
}

function parseSetCookieHeader(header: string): CookieSpec | null {
  const parts = header.split(';');
  const [nameValue] = parts;
  const eqIdx = nameValue.indexOf('=');
  if (eqIdx === -1) return null;

  const name = nameValue.slice(0, eqIdx).trim();
  const value = nameValue.slice(eqIdx + 1).trim();

  const domainMatch = header.match(/Domain=([^;]+)/i);
  const domain = domainMatch ? domainMatch[1].trim() : '';

  return { name, value, domain };
}

async function getAuthCookies(targetCdnDomain: string): Promise<CookieSpec[]> {
  const cookies: CookieSpec[] = [];

  if (ACCESS_TOKEN) {
    console.log('[Auth] Using ACCESS_TOKEN from env');
    cookies.push({
      name: 'accessToken',
      value: ACCESS_TOKEN,
      domain: targetCdnDomain,
    });
    return cookies;
  }

  if (USER_ID && PASSWORD) {
    console.log(`[Auth] Logging in with USER_ID=${USER_ID} to ${CMS_ENV} environment...`);
    const apiBase = API_BASE[CMS_ENV as keyof typeof API_BASE] || API_BASE.test;
    const loginUrl = `${apiBase}/auth/signin`;

    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, password: PASSWORD }),
      });

      console.log(`[Auth] Login response status: ${response.status}`);

      const setCookieHeaders: string[] = [];
      try {
        const rawCookies = (response.headers as any).getSetCookie?.();
        if (Array.isArray(rawCookies)) {
          setCookieHeaders.push(...rawCookies);
        }
      } catch {
        const raw = response.headers.get('set-cookie');
        if (raw) setCookieHeaders.push(raw);
      }

      console.log(`[Auth] Set-Cookie headers found: ${setCookieHeaders.length}`);
      for (const h of setCookieHeaders) {
        console.log(`[Auth] Set-Cookie: ${h.substring(0, 120)}...`);
        const parsed = parseSetCookieHeader(h);
        if (parsed) {
          const effectiveDomain = parsed.domain || targetCdnDomain;
          cookies.push({ ...parsed, domain: effectiveDomain });
        }
      }

      const data = await response.json();
      console.log(`[Auth] Login response code: ${data.code}, message: ${data.message || 'N/A'}`);

      if (data.code === '1000' && data.data?.accessToken) {
        console.log('[Auth] Login successful, accessToken found in body');
        cookies.push({
          name: 'accessToken',
          value: data.data.accessToken as string,
          domain: targetCdnDomain,
        });
      } else {
        console.error(`[Auth] Login API returned error: ${data.message || 'Unknown'}`);
      }
    } catch (err: any) {
      console.error(`[Auth] Login request failed: ${err.message}`);
    }
  }

  if (cookies.length === 0) {
    console.warn('[Auth] No authentication cookies obtained. Set ACCESS_TOKEN or USER_ID+PASSWORD in .env.local');
  } else {
    console.log(`[Auth] Total cookies to set: ${cookies.length}`);
    for (const c of cookies) {
      console.log(`[Auth] Cookie: name=${c.name}, domain=${c.domain}, value_len=${c.value.length}`);
    }
  }

  return cookies;
}

function getSlug(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'index';
    return last.replace(/\.[^.]+$/, '');
  } catch {
    return 'unknown';
  }
}

async function analyzeSingleUrl(
  url: string,
  timestamp: string,
  screenshotDir: string,
  authCookies: CookieSpec[]
): Promise<AnalysisResult> {
  const slug = getSlug(url);
  const screenshotFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${slug}.png`;
  const screenshotFilePath = path.join(screenshotDir, screenshotFileName);
  const publicPath = `/screenshots/${screenshotFileName}`;

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();

    if (authCookies.length > 0) {
      const cookieDomain = new URL(url).hostname;
      const playwrightCookies = authCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || cookieDomain,
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax' as const,
      }));

      console.log(`[Playwright] Setting ${playwrightCookies.length} cookies for domain ${cookieDomain}`);
      await context.addCookies(playwrightCookies);
    }

    const page = await context.newPage();
    
    // Capture browser console logs
    page.on('console', (msg) => {
      if (msg.text().includes('[Wrapper]') || msg.text().includes('[Analyzer]')) {
        console.log(`[Browser] ${msg.text()}`);
      }
    });

    try {
      // Enable CDP Network tracking for resource sizes
      const client = await page.context().newCDPSession(page);
      await client.send('Network.enable');
      let totalEncodedLength = 0;
      client.on('Network.loadingFinished', (params: { encodedDataLength: number }) => {
        totalEncodedLength += params.encodedDataLength;
      });

      const startTime = Date.now();

      // Navigate directly to the CMS content URL
      // In standalone mode, window.parent === window, so postMessage from CMS
      // will be dispatched on this page's window itself
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      console.log(`[Analyzer] Page load event reached for ${url}`);

      // Wait for CMS content to send LOAD_COMPLETE postMessage (max 3s)
      // CMS contents in iframe do: window.parent.postMessage({ type: 'LOAD_COMPLETE' }, '*')
      // In standalone page, this usually doesn't fire because parent === self
      console.log(`[Analyzer] Waiting for LOAD_COMPLETE from CMS (max 3s)...`);
      const loadCompleteResult = await page.evaluate(() => {
        return new Promise<{ received: boolean }>((resolve) => {
          const handler = (event: MessageEvent) => {
            if (event.data?.type === 'LOAD_COMPLETE') {
              window.removeEventListener('message', handler);
              resolve({ received: true });
            }
          };
          window.addEventListener('message', handler);

          // 3s timeout — CMS either sends it quickly or not at all
          setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve({ received: false });
          }, 3000);
        });
      });

      const endTime = Date.now();
      const loadTime = (endTime - startTime) / 1000;

      if (loadCompleteResult.received) {
        console.log(`[Analyzer] LOAD_COMPLETE received for ${url} (total ${loadTime.toFixed(1)}s)`);
      } else {
        console.warn(`[Analyzer] LOAD_COMPLETE not received for ${url}, using fallback (total ${loadTime.toFixed(1)}s)`);
        // Fallback: wait additional time for JS rendering
        await page.waitForTimeout(1500);
      }

      // Memory (Chromium specific)
      const memoryUsed = await page.evaluate(() => {
        try {
          const mem = (performance as any).memory;
          if (mem) return mem.usedJSHeapSize as number;
        } catch {
          // ignore
        }
        return 0;
      });
      const memoryMB = memoryUsed / (1024 * 1024);

      // Size: encodedDataLength from CDP is base64 length, multiply by 0.75 for approx bytes
      const sizeBytes = totalEncodedLength * 0.75;
      const sizeMB = sizeBytes / (1024 * 1024);

      // Screenshot (full page)
      await page.screenshot({ path: screenshotFilePath, fullPage: true });
      console.log(`[Analyzer] Screenshot saved for ${url} (loadTime: ${loadTime.toFixed(1)}s)`);

      return {
        url,
        slug,
        loadTime,
        memory: memoryMB,
        size: sizeMB,
        screenshotPath: publicPath,
        score: 0,
        status: 'success',
        analyzedAt: timestamp,
      };
    } catch (err: any) {
      return {
        url,
        slug,
        loadTime: 0,
        memory: 0,
        size: 0,
        screenshotPath: '',
        score: 0,
        status: 'error',
        errorMessage: err.message,
        analyzedAt: timestamp,
      };
    } finally {
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export async function analyzeUrls(urls: string[]): Promise<AnalysisResult[]> {
  const timestamp = new Date().toISOString();
  const screenshotDir = await ensureScreenshotsDir();

  const firstUrl = urls[0];
  const targetCdnDomain = firstUrl ? new URL(firstUrl).hostname : CDN_DOMAIN.test;

  const authCookies = await getAuthCookies(targetCdnDomain);

  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    urls.map((url) => limit(() => analyzeSingleUrl(url, timestamp, screenshotDir, authCookies)))
  );

  return results;
}
