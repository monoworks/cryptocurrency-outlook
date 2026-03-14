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

/** Keywords that indicate crypto regulation (vs general geopolitical) */
const CRYPTO_REGULATION_RE = /\b(SEC|crypto|bitcoin|stablecoin|CBDC|exchange hack|binance|coinbase|ripple|ethereum ETF|crypto ban)\b/i;

/** Classify an article as geopolitical or crypto-regulation based on content */
function classifyTag(article: RawArticle): NewsTag {
  const text = `${article.title} ${article.description ?? ''}`;
  return CRYPTO_REGULATION_RE.test(text) ? 'crypto' : 'geopolitical';
}

/**
 * Fetch latest risk-relevant news: geopolitical events + crypto regulation.
 * Single query combining both categories, then auto-tagged by content.
 * Returns null if API key is not configured or fetch fails.
 */
export async function fetchNews(): Promise<NewsArticle[] | null> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    console.log('[News] NEWSDATA_API_KEY is not configured');
    return null;
  }

  try {
    const q = [
      // Geopolitical risk
      'war', 'sanctions', '"Federal Reserve"', '"interest rate"',
      'missile', 'airstrike', 'military',
      // Crypto regulation & policy
      'SEC', 'crypto regulation', 'crypto ban', 'CBDC',
    ].join(' OR ');

    const params = new URLSearchParams({
      apikey: apiKey,
      q,
      language: 'en',
      size: '20',
    });

    const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 1800 }, // cache 30 minutes
    });

    if (!res.ok) {
      console.error(`[News] API error: ${res.status}`);
      return null;
    }

    const data = await res.json() as {
      status: string;
      results?: RawArticle[];
    };

    if (data.status !== 'success' || !Array.isArray(data.results)) {
      return null;
    }

    const articles: NewsArticle[] = data.results.map((item) => ({
      title: item.title,
      description: item.description,
      link: item.link,
      source: item.source_name || item.source_id,
      pubDate: item.pubDate,
      pubDateJST: toJST(item.pubDate),
      category: item.category ?? [],
      tag: classifyTag(item),
    }));

    // Sort newest first
    articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    return articles;
  } catch {
    return null;
  }
}
