import fs from 'fs/promises';
import path from 'path';
import { AnalysisResult, UrlItem } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const URLS_FILE = path.join(DATA_DIR, 'urls.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

// Legacy string-array loader for migration
export async function loadRawUrls(): Promise<string[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(URLS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      // Could be legacy string[] or new UrlItem[]
      if (data.length > 0 && typeof data[0] === 'string') return data;
      if (data.length > 0 && typeof data[0] === 'object' && data[0].url) {
        return (data as UrlItem[]).map((u) => u.url);
      }
    }
    if (data && Array.isArray(data.urls)) return data.urls;
    return [];
  } catch {
    return [];
  }
}

export async function loadUrlItems(): Promise<UrlItem[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(URLS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0].url !== undefined) {
      return data as UrlItem[];
    }
    // Legacy string[] → migrate
    if (Array.isArray(data) && (data.length === 0 || typeof data[0] === 'string')) {
      const items: UrlItem[] = (data as string[]).map((url) => ({ url, checked: true }));
      await saveUrlItems(items);
      return items;
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveUrlItems(items: UrlItem[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(URLS_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

export async function loadResults(): Promise<AnalysisResult[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(RESULTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveResults(results: AnalysisResult[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf-8');
}

// Ensure screenshots dir exists
export async function ensureScreenshotsDir(): Promise<string> {
  const dir = path.join(process.cwd(), 'public', 'screenshots');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
