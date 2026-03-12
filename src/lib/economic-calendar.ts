import { EconomicEvent, EconomicCalendarAnalysis } from './types';

/**
 * Forex Factory calendar feed (free, no API key required).
 * Rate limit: max 2 requests per 5 minutes — use aggressive caching.
 */
const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

interface FFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

/**
 * Format an ISO date string to JST display string (e.g. "3/12 22:30")
 */
function toJST(isoDateStr: string): string {
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return isoDateStr;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function normalizeImpact(raw: string): EconomicEvent['impact'] {
  const s = raw.toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
}

/**
 * Fetch upcoming US economic events from Forex Factory.
 * Returns null if fetch fails.
 */
export async function fetchEconomicCalendar(): Promise<EconomicEvent[] | null> {
  try {
    const res = await fetch(FF_CALENDAR_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data = await res.json() as FFEvent[];

    if (!Array.isArray(data) || data.length === 0) return null;

    const now = new Date();
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Filter USD events within 48-hour window, exclude holidays
    return data
      .filter((e) => {
        if (e.country !== 'USD' || !e.date) return false;
        if (e.impact?.toLowerCase() === 'holiday') return false;
        const t = new Date(e.date);
        return !isNaN(t.getTime()) && t >= now && t <= cutoff;
      })
      .map((e) => ({
        event: e.title,
        country: 'US',
        time: new Date(e.date).toISOString(),
        timeJST: toJST(e.date),
        impact: normalizeImpact(e.impact),
        forecast: e.forecast || undefined,
        prev: e.previous || undefined,
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  } catch {
    return null;
  }
}

/**
 * Analyze economic events and produce warning levels + confidence impact.
 */
export function analyzeEconomicCalendar(events: EconomicEvent[] | null): EconomicCalendarAnalysis {
  if (!events || events.length === 0) {
    return {
      events: [],
      hasHighImpact: false,
      warningLevel: 'none',
      description: '48時間以内に主要な米国経済指標の発表予定なし',
      confidenceImpact: 0,
    };
  }

  const now = Date.now();
  const highImpactEvents = events.filter((e) => e.impact === 'high');
  const hasHighImpact = highImpactEvents.length > 0;

  // Find nearest high-impact event in the future
  let nearestHighImpact: EconomicCalendarAnalysis['nearestHighImpact'];
  let warningLevel: EconomicCalendarAnalysis['warningLevel'] = 'none';
  let confidenceImpact = 0;

  if (hasHighImpact) {
    const futureHigh = highImpactEvents.find((e) => new Date(e.time).getTime() > now);
    if (futureHigh) {
      const hoursUntil = (new Date(futureHigh.time).getTime() - now) / (1000 * 60 * 60);
      nearestHighImpact = {
        event: futureHigh.event,
        hoursUntil: Math.round(hoursUntil * 10) / 10,
        timeJST: futureHigh.timeJST,
      };

      if (hoursUntil <= 6) {
        warningLevel = 'danger';
        confidenceImpact = -15;
      } else if (hoursUntil <= 24) {
        warningLevel = 'caution';
        confidenceImpact = -10;
      }
    }
  }

  // Build description
  let description: string;
  if (warningLevel === 'danger' && nearestHighImpact) {
    description = `⚠ ${nearestHighImpact.timeJST} (JST) に ${nearestHighImpact.event} 発表予定 (${nearestHighImpact.hoursUntil.toFixed(1)}時間後)。急変動リスク大 — 様子見推奨`;
  } else if (warningLevel === 'caution' && nearestHighImpact) {
    description = `注意: ${nearestHighImpact.timeJST} (JST) に ${nearestHighImpact.event} 発表予定 (${nearestHighImpact.hoursUntil.toFixed(1)}時間後)`;
  } else if (hasHighImpact) {
    description = `48時間以内に重要指標あり: ${highImpactEvents.map((e) => e.event).join(', ')}`;
  } else {
    const mediumEvents = events.filter((e) => e.impact === 'medium');
    description = mediumEvents.length > 0
      ? `中程度の指標予定あり: ${mediumEvents.map((e) => e.event).join(', ')}`
      : '48時間以内に主要な米国経済指標の発表予定なし';
  }

  return {
    events,
    hasHighImpact,
    nearestHighImpact,
    warningLevel,
    description,
    confidenceImpact,
  };
}
