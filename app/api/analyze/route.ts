import { NextRequest, NextResponse } from 'next/server';
import { analyzeUrls } from '@/lib/analyzer';
import { calculateScores, sortByPriority } from '@/lib/scoring';
import { loadResults, saveResults } from '@/lib/storage';
import { AnalyzePayload, AnalyzeResponse } from '@/types';

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const isRandom = searchParams.get('random') === 'true';

    if (limit !== undefined && (isNaN(limit) || limit <= 0)) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          totalCount: 0,
          successCount: 0,
          failCount: 0,
          message: 'Invalid limit parameter',
        },
        { status: 400 }
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
      return NextResponse.json(
        {
          success: false,
          results: [],
          totalCount: 0,
          successCount: 0,
          failCount: 0,
          message: 'No URLs to analyze. Please check URLs in the list and sync if needed.',
        },
        { status: 400 }
      );
    }

    if (isRandom) {
      urls = shuffleArray(urls);
    }

    if (limit && urls.length > limit) {
      urls = urls.slice(0, limit);
    }

    const results = await analyzeUrls(urls);
    const scored = calculateScores(results);
    const sorted = sortByPriority(scored);

    await saveResults(sorted);

    const successCount = sorted.filter((r) => r.status === 'success').length;
    const failCount = sorted.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      results: sorted,
      totalCount: sorted.length,
      successCount,
      failCount,
    });
  } catch (err: any) {
    return NextResponse.json(
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

export async function GET(): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const results = await loadResults();
    const successCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      results,
      totalCount: results.length,
      successCount,
      failCount,
    });
  } catch (err: any) {
    return NextResponse.json(
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
