import { NextRequest } from 'next/server';
import { analyzeUrls } from '@/lib/analyzer';
import { calculateScores, sortByPriority } from '@/lib/scoring';
import { saveResults } from '@/lib/storage';
import { AnalyzePayload, AnalysisResult } from '@/types';

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sendSSE(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const encoder = new TextEncoder();
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(message));
}

export async function POST(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const isRandom = searchParams.get('random') === 'true';

  if (limit !== undefined && (isNaN(limit) || limit <= 0)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid limit parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Read URLs from request body
  let urls: string[] = [];
  try {
    const body = (await request.json()) as AnalyzePayload;
    if (body && Array.isArray(body.urls)) {
      urls = body.urls;
    }
  } catch {
    // If no body or invalid, try to fall back to storage
  }

  if (urls.length === 0) {
    return new Response(
      JSON.stringify({ success: false, message: 'No URLs to analyze. Please check URLs in the list and sync if needed.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (isRandom) {
    urls = shuffleArray(urls);
  }

  if (limit && urls.length > limit) {
    urls = urls.slice(0, limit);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const total = urls.length;
        const results: AnalysisResult[] = [];
        let completed = 0;

        sendSSE(controller, 'log', { message: `분석 시작: 총 ${total}개 URL` });

        const analyzedResults = await analyzeUrls(urls, {
          onLog: (message: string) => {
            sendSSE(controller, 'log', { message });
          },
          onProgress: (current: number, total: number) => {
            completed = current;
            const percentage = Math.round((current / total) * 100);
            sendSSE(controller, 'progress', { current, total, percentage });
          },
          onResult: (result: AnalysisResult) => {
            results.push(result);
          },
        });

        const scored = calculateScores(analyzedResults);
        const sorted = sortByPriority(scored);

        await saveResults(sorted);

        const successCount = sorted.filter((r) => r.status === 'success').length;
        const failCount = sorted.filter((r) => r.status === 'error').length;

        sendSSE(controller, 'complete', {
          results: sorted,
          totalCount: sorted.length,
          successCount,
          failCount,
        });

        controller.close();
      } catch (err: any) {
        sendSSE(controller, 'error', { message: err.message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function GET(): Promise<Response> {
  try {
    const { loadResults } = await import('@/lib/storage');
    const results = await loadResults();
    const successCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.filter((r) => r.status === 'error').length;

    return Response.json({
      success: true,
      results,
      totalCount: results.length,
      successCount,
      failCount,
    });
  } catch (err: any) {
    return Response.json(
      {
        success: false,
        results: [],
        totalCount: 0,
        successCount: 0,
        failCount: 0,
        message: err.message,
      },
      { status: 500 }
    );
  }
}
