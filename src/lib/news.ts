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
 * Fetch latest news related to crypto, geopolitics, and regulation from NewsData.io.
 * Returns null if API key is not configured or fetch fails.
 */
export async function fetchNews(): Promise<NewsArticle[] | null> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    console.log('[News] NEWSDATA_API_KEY is not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q: 'crypto OR bitcoin',
      language: 'en',
      size: '10',
    });

    const url = `${NEWSDATA_BASE}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 }, // cache 10 minutes
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[News] API error: ${res.status} ${text}`);
      return null;
    }

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
      console.error('[News] Unexpected response:', JSON.stringify(data).slice(0, 200));
      return null;
    }

    return data.results.map((item) => ({
      title: item.title,
      description: item.description,
      link: item.link,
      source: item.source_name || item.source_id,
      pubDate: item.pubDate,
      pubDateJST: toJST(item.pubDate),
      category: item.category ?? [],
    }));
  } catch {
    return null;
  }
}
