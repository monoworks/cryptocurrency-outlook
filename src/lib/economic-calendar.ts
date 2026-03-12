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

/**
 * Translate Forex Factory event titles to Japanese.
 * Uses keyword-based mapping + suffix translation (m/m, q/q, y/y).
 */
const EVENT_NAME_MAP: Record<string, string> = {
  'Non-Farm Employment Change': '非農業部門雇用者数変化',
  'Unemployment Rate': '失業率',
  'Average Hourly Earnings m/m': '平均時給 (前月比)',
  'Core PCE Price Index m/m': 'コアPCE価格指数 (前月比)',
  'PCE Price Index m/m': 'PCE価格指数 (前月比)',
  'Core CPI m/m': 'コアCPI (前月比)',
  'CPI m/m': 'CPI (前月比)',
  'CPI y/y': 'CPI (前年比)',
  'Core CPI y/y': 'コアCPI (前年比)',
  'PPI m/m': 'PPI (前月比)',
  'Core PPI m/m': 'コアPPI (前月比)',
  'Retail Sales m/m': '小売売上高 (前月比)',
  'Core Retail Sales m/m': 'コア小売売上高 (前月比)',
  'Prelim GDP q/q': 'GDP速報値 (前期比)',
  'Final GDP q/q': 'GDP確定値 (前期比)',
  'Advance GDP q/q': 'GDP事前値 (前期比)',
  'GDP Price Index q/q': 'GDP価格指数 (前期比)',
  'Prelim GDP Price Index q/q': 'GDP価格指数速報値 (前期比)',
  'FOMC Statement': 'FOMC声明',
  'Federal Funds Rate': 'FF金利',
  'FOMC Press Conference': 'FOMC記者会見',
  'FOMC Meeting Minutes': 'FOMC議事録',
  'JOLTS Job Openings': 'JOLTS求人件数',
  'ISM Manufacturing PMI': 'ISM製造業PMI',
  'ISM Services PMI': 'ISMサービス業PMI',
  'Durable Goods Orders m/m': '耐久財受注 (前月比)',
  'Core Durable Goods Orders m/m': 'コア耐久財受注 (前月比)',
  'Personal Spending m/m': '個人支出 (前月比)',
  'Personal Income m/m': '個人所得 (前月比)',
  'CB Consumer Confidence': 'CB消費者信頼感指数',
  'Pending Home Sales m/m': '中古住宅販売保留 (前月比)',
  'Existing Home Sales': '中古住宅販売件数',
  'New Home Sales': '新築住宅販売件数',
  'Building Permits': '建設許可件数',
  'Housing Starts': '住宅着工件数',
  'ADP Non-Farm Employment Change': 'ADP非農業部門雇用者数',
  'Unemployment Claims': '新規失業保険申請件数',
  'Prelim UoM Consumer Sentiment': 'ミシガン大消費者信頼感指数速報',
  'Revised UoM Consumer Sentiment': 'ミシガン大消費者信頼感指数改定',
  'Prelim UoM Inflation Expectations': 'ミシガン大インフレ期待速報',
  'Revised UoM Inflation Expectations': 'ミシガン大インフレ期待改定',
  'Empire State Manufacturing Index': 'NY連銀製造業景気指数',
  'Philly Fed Manufacturing Index': 'フィラデルフィア連銀製造業指数',
  'Industrial Production m/m': '鉱工業生産 (前月比)',
  'Capacity Utilization Rate': '設備稼働率',
  'Trade Balance': '貿易収支',
  'Current Account': '経常収支',
  'Treasury Currency Report': '財務省為替報告書',
  'Crude Oil Inventories': '原油在庫量',
  'Natural Gas Storage': '天然ガス貯蔵量',
  'Consumer Credit m/m': '消費者信用残高 (前月比)',
  'Final GDP Price Index q/q': 'GDP価格指数確定値 (前期比)',
  'Core PCE Price Index y/y': 'コアPCE価格指数 (前年比)',
  'PCE Price Index y/y': 'PCE価格指数 (前年比)',
  'Chicago PMI': 'シカゴPMI',
  'Richmond Manufacturing Index': 'リッチモンド連銀製造業指数',
  'S&P/CS Composite-20 HPI y/y': 'S&P/ケースシラー住宅価格指数 (前年比)',
  'Revised Nonfarm Productivity q/q': '非農業部門労働生産性改定値 (前期比)',
  'Revised Unit Labor Costs q/q': '単位労働コスト改定値 (前期比)',
  'Prelim Nonfarm Productivity q/q': '非農業部門労働生産性速報値 (前期比)',
  'Prelim Unit Labor Costs q/q': '単位労働コスト速報値 (前期比)',
  'Factory Orders m/m': '製造業新規受注 (前月比)',
  'Goods Trade Balance': '財貿易収支',
  'Wholesale Inventories m/m': '卸売在庫 (前月比)',
};

const SUFFIX_MAP: [RegExp, string][] = [
  [/ m\/m$/, ' (前月比)'],
  [/ q\/q$/, ' (前期比)'],
  [/ y\/y$/, ' (前年比)'],
];

function translateEventName(title: string): string {
  if (EVENT_NAME_MAP[title]) return EVENT_NAME_MAP[title];

  // Try suffix replacement for unmapped events
  for (const [pattern, replacement] of SUFFIX_MAP) {
    if (pattern.test(title)) {
      const base = title.replace(pattern, '');
      if (EVENT_NAME_MAP[base + title.match(pattern)![0]]) {
        return EVENT_NAME_MAP[base + title.match(pattern)![0]];
      }
      return base + replacement;
    }
  }
  return title;
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
        event: translateEventName(e.title),
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
