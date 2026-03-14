import { NextResponse } from 'next/server';
import { fetchFearGreedIndex } from '@/lib/sentiment';
import { fetchEconomicCalendar } from '@/lib/economic-calendar';
import { setFearGreedCache, setEconomicCalendarCache } from '@/lib/external-cache';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';

/**
 * GET /api/refresh-external
 * Fetches Fear & Greed index + economic calendar and stores in in-memory cache.
 * Designed to be called by an external cron every 30 minutes.
 */
export async function GET() {
  const results: Record<string, string> = {};

  const [fearGreed, economicEvents] = await Promise.all([
    fetchFearGreedIndex().catch(() => null),
    fetchEconomicCalendar().catch(() => null),
  ]);

  if (fearGreed) {
    setFearGreedCache(fearGreed);
    results.fearGreed = `cached (value=${fearGreed.value})`;
  } else {
    results.fearGreed = 'fetch failed or null';
  }

  if (economicEvents) {
    setEconomicCalendarCache(economicEvents);
    results.economicCalendar = `cached (${economicEvents.length} events)`;
  } else {
    results.economicCalendar = 'fetch failed or null';
  }

  return NextResponse.json({ ok: true, ...results });
}
