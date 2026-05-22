import { NextResponse } from 'next/server';
import { saveUrlItems } from '@/lib/storage';
import { SyncResponse } from '@/types';

export async function POST(): Promise<NextResponse<SyncResponse>> {
  try {
    const res = await fetch('https://playground.cms.codmos.io/api/missions/test');
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }

    const urls: unknown = await res.json();

    if (!Array.isArray(urls)) {
      throw new Error('Invalid response format: expected array of URLs');
    }

    const validUrls = urls.filter((u): u is string => typeof u === 'string');
    
    // Save as UrlItem with checked: true by default
    const urlItems = validUrls.map((url) => ({ url, checked: true }));
    await saveUrlItems(urlItems);

    return NextResponse.json({
      success: true,
      count: validUrls.length,
      urls: validUrls,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        count: 0,
        urls: [],
        message: err.message,
      },
      { status: 500 }
    );
  }
}
