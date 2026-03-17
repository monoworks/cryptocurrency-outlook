import { NextResponse } from 'next/server';
import { fetchNews } from '@/lib/news';
import { notifyNews } from '@/lib/telegram';
import { setNewsCache } from '@/lib/external-cache';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';

/**
 * GET /api/news-notify
 * Fetches latest news and sends new high-relevance articles to Telegram.
 * Also updates the in-memory news cache for /api/analyze.
 * Designed to be called by an external cron (e.g. cron-job.org) every 5 minutes.
 */
export async function GET() {
  const articles = await fetchNews();

  // Update cache regardless (empty = no relevant news right now)
  if (articles && articles.length > 0) {
    setNewsCache(articles);
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ notified: 0, message: 'No relevant news' });
  }

  // Only notify high impact articles
  const notable = articles.filter((a) => a.impact === 'high');

  const notified = await notifyNews(notable);

  return NextResponse.json({
    notified,
    total: articles.length,
    notable: notable.length,
  });
}
