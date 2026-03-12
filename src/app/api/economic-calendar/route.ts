import { NextResponse } from 'next/server';
import { fetchEconomicCalendar, analyzeEconomicCalendar } from '@/lib/economic-calendar';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';

export async function GET() {
  try {
    const events = await fetchEconomicCalendar();
    const analysis = analyzeEconomicCalendar(events);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json(
      analyzeEconomicCalendar(null),
    );
  }
}
