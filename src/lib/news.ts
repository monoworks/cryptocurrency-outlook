import { NewsArticle, NewsTag } from './types';

const NEWSDATA_BASE = 'https://newsdata.io/api/1/latest';

/**
 * Format a UTC date string to JST display string (e.g. "3/12 22:30")
 */
function toJST(utcDateStr: string): string {
  const d = new Date(utcDateStr);
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

interface RawArticle {
  title: string;
  description: string | null;
  link: string;
  source_id: string;
  source_name?: string;
  pubDate: string;
  category?: string[];
}

/** Fetch a single query from NewsData.io and tag results */
async function fetchQuery(
  apiKey: string,
  q: string,
  tag: NewsTag,
  size: number = 10,
): Promise<NewsArticle[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    q,
    language: 'en',
    size: String(size),
  });

  const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 1800 }, // cache 30 minutes (API credit conservation)
  });

  if (!res.ok) {
    console.error(`[News:${tag}] API error: ${res.status}`);
    return [];
  }

  const data = await res.json() as {
    status: string;
    results?: RawArticle[];
  };

  if (data.status !== 'success' || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item) => ({
    title: item.title,
    description: item.description,
    link: item.link,
    source: item.source_name || item.source_id,
    pubDate: item.pubDate,
    pubDateJST: toJST(item.pubDate),
    category: item.category ?? [],
    tag,
  }));
}

/**
 * Fetch latest risk-relevant news: geopolitical events + crypto regulation.
 * Returns null if API key is not configured or both fetches fail.
 */
export async function fetchNews(): Promise<NewsArticle[] | null> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    console.log('[News] NEWSDATA_API_KEY is not configured');
    return null;
  }

  try {
    const [geopolitical, regulation] = await Promise.all([
      fetchQuery(
        apiKey,
        'war OR sanctions OR "Federal Reserve" OR "interest rate" OR missile OR airstrike OR military',
        'geopolitical',
        10,
      ),
      fetchQuery(
        apiKey,
        'SEC OR "crypto regulation" OR "crypto ban" OR CBDC OR "stablecoin bill"',
        'crypto',
        10,
      ),
    ]);

    const all = [...geopolitical, ...regulation];
    if (all.length === 0) return null;

    // Dedupe by link
    const seen = new Set<string>();
    const deduped = all.filter((a) => {
      if (seen.has(a.link)) return false;
      seen.add(a.link);
      return true;
    });

    // Sort newest first
    deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    return deduped;
  } catch {
    return null;
  }
}
