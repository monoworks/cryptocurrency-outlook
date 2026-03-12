import { NextResponse } from 'next/server';
import { fetchNews } from '@/lib/news';

export const preferredRegion = 'hnd1';

export async function GET() {
  try {
    const articles = await fetchNews();
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ articles: null });
  }
}
