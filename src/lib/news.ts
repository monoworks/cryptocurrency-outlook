import { NewsArticle } from './types';

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

/**
 * Build Google Translate URL for a given article URL
 */
function buildTranslateUrl(url: string): string {
  return `https://translate.google.com/translate?sl=en&tl=ja&u=${encodeURIComponent(url)}`;
}

/**
 * Fetch latest news related to crypto, geopolitics, and regulation from NewsData.io.
 * Returns null if API key is not configured or fetch fails.
 */
export async function fetchNews(): Promise<NewsArticle[] | null> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) return null;

  try {
    const query = 'crypto OR bitcoin OR ethereum OR regulation OR sanctions OR geopolitical OR "central bank"';
    const params = new URLSearchParams({
      apikey: apiKey,
      q: query,
      language: 'en',
      category: 'business,politics,world',
      size: '10',
    });

    const url = `${NEWSDATA_BASE}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 }, // cache 10 minutes
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      status: string;
      results?: {
        title: string;
        description: string | null;
        link: string;
        source_id: string;
        source_name?: string;
        pubDate: string;
        category?: string[];
      }[];
    };

    if (data.status !== 'success' || !data.results || !Array.isArray(data.results)) {
      return null;
    }

    return data.results.map((item) => ({
      title: item.title,
      description: item.description,
      link: item.link,
      translatedLink: buildTranslateUrl(item.link),
      source: item.source_name || item.source_id,
      pubDate: item.pubDate,
      pubDateJST: toJST(item.pubDate),
      category: item.category ?? [],
    }));
  } catch {
    return null;
  }
}
