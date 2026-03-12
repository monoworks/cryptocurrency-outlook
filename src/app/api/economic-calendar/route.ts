import { NextResponse } from 'next/server';
import { fetchEconomicCalendar, analyzeEconomicCalendar } from '@/lib/economic-calendar';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';

export async function GET() {
  try {
    const hasKey = !!process.env.FINNHUB_API_KEY;
    const events = await fetchEconomicCalendar();
    const analysis = analyzeEconomicCalendar(events);
    return NextResponse.json({
      ...analysis,
      _debug: {
        hasApiKey: hasKey,
        rawEventCount: events?.length ?? 0,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json({
      ...analyzeEconomicCalendar(null),
      _debug: {
        error: err instanceof Error ? err.message : String(err),
        hasApiKey: !!process.env.FINNHUB_API_KEY,
      },
    });
  }
}
