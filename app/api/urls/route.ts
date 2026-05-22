import { NextRequest, NextResponse } from 'next/server';
import { loadUrlItems, saveUrlItems } from '@/lib/storage';
import { UrlListResponse } from '@/types';

export async function GET(): Promise<NextResponse<UrlListResponse>> {
  try {
    const urls = await loadUrlItems();
    return NextResponse.json({ urls });
  } catch (err: any) {
    return NextResponse.json(
      { urls: [], message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<UrlListResponse>> {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json(
        { urls: [], message: 'Expected array of {url, checked} items' },
        { status: 400 }
      );
    }
    await saveUrlItems(body);
    return NextResponse.json({ urls: body });
  } catch (err: any) {
    return NextResponse.json(
      { urls: [], message: err.message },
      { status: 500 }
    );
  }
}
