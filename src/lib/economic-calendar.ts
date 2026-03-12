import { EconomicEvent, EconomicCalendarAnalysis } from './types';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

/**
 * Format a UTC date string to JST display string (e.g. "3/12 22:30")
 */
function toJST(utcDateStr: string): string {
  // Finnhub returns "YYYY-MM-DD HH:MM:SS" without timezone — treat as UTC
  const normalized = utcDateStr.includes('T') ? utcDateStr : utcDateStr.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return utcDateStr;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Map Finnhub impact string to our normalized impact level.
 * Finnhub uses "high", "medium", "low" (or numeric 1-3 in some responses).
 */
function normalizeImpact(raw: string | number): EconomicEvent['impact'] {
  if (typeof raw === 'number') {
    if (raw >= 3) return 'high';
    if (raw >= 2) return 'medium';
    return 'low';
  }
  const s = String(raw).toLowerCase();
  if (s === 'high' || s === '3') return 'high';
  if (s === 'medium' || s === '2') return 'medium';
  return 'low';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Fetch upcoming US economic events from Finnhub.
 * Returns null if API key is not configured or fetch fails.
 */
// Exposed for debugging — stores last raw response from Finnhub
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let _lastFinnhubDebug: { url: string; status: number; keys: string[]; sample: any; totalRaw: number } | null = null;

export async function fetchEconomicCalendar(): Promise<EconomicEvent[] | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;

  try {
    const now = new Date();
    const from = formatDate(now);
    const to = formatDate(new Date(now.getTime() + 48 * 60 * 60 * 1000));

    const url = `${FINNHUB_BASE}/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      _lastFinnhubDebug = { url: url.replace(apiKey, '***'), status: res.status, keys: [], sample: null, totalRaw: 0 };
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as Record<string, any>;

    // Capture raw response shape for debugging
    const ecField = data.economicCalendar;
    _lastFinnhubDebug = {
      url: url.replace(apiKey, '***'),
      status: res.status,
      keys: Object.keys(data),
      sample: Array.isArray(ecField) ? ecField.slice(0, 2)
        : ecField && typeof ecField === 'object' ? { subKeys: Object.keys(ecField), sample: Array.isArray(ecField.result) ? ecField.result.slice(0, 2) : null }
        : ecField,
      totalRaw: Array.isArray(ecField) ? ecField.length : (ecField?.result?.length ?? 0),
    };

    // Finnhub may return { economicCalendar: [...] } or { economicCalendar: { result: [...] } }
    let rawEvents: {
      event: string;
      country: string;
      time: string;
      impact: string | number;
      estimate?: number;
      actual?: number;
      prev?: number;
      unit?: string;
    }[] | undefined;

    if (Array.isArray(data.economicCalendar)) {
      rawEvents = data.economicCalendar;
    } else if (data.economicCalendar && Array.isArray(data.economicCalendar.result)) {
      rawEvents = data.economicCalendar.result;
    }

    if (!rawEvents || rawEvents.length === 0) {
      console.warn('[economic-calendar] No events from Finnhub. Response keys:', Object.keys(data));
      return null;
    }

    console.log(`[economic-calendar] Finnhub returned ${rawEvents.length} raw events`);

    // Normalize time to ISO UTC string for consistent parsing
    const normalizeTime = (t: string) =>
      t.includes('T') ? t : t.replace(' ', 'T') + 'Z';

    // Filter US events only, with valid time
    const usEvents = rawEvents
      .filter((e) => e.country === 'US' && e.time)
      .map((e) => ({
        event: e.event,
        country: e.country,
        time: normalizeTime(e.time),
        timeJST: toJST(e.time),
        impact: normalizeImpact(e.impact),
        estimate: e.estimate,
        actual: e.actual,
        prev: e.prev,
        unit: e.unit,
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    console.log(`[economic-calendar] ${usEvents.length} US events after filtering`);
    return usEvents;
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
