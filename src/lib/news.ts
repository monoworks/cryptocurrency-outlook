import { NewsArticle, NewsAnalysis, NewsImpact, NewsTag } from './types';

const NEWSDATA_BASE = 'https://newsdata.io/api/1/latest';

/** Sources to exclude (low-quality or flagged as unsafe) */
const EXCLUDED_SOURCES = new Set([
  'techbullion',
]);

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

// ── Relevance scoring ───────────────────────────────────────────────
// Each keyword pattern has a weight (higher = more relevant to crypto prices)
// and a risk direction: -1 = risk-off (bearish for crypto), +1 = risk-on, 0 = neutral

interface KeywordRule {
  pattern: RegExp;
  weight: number;       // 0-5 relevance boost
  riskDirection: number; // -1 risk-off, +1 risk-on, 0 neutral
}

const HIGH_IMPACT_KEYWORDS: KeywordRule[] = [
  // Fed / interest rates — direct impact on risk assets
  { pattern: /\b(federal reserve|the fed|fed chair|powell)\b/i, weight: 5, riskDirection: 0 },
  { pattern: /\b(interest rate|rate cut|rate hike|rate decision|rate hold)\b/i, weight: 5, riskDirection: 0 },
  { pattern: /\brate cut/i, weight: 5, riskDirection: 1 },
  { pattern: /\brate hike/i, weight: 5, riskDirection: -1 },
  { pattern: /\b(fomc|monetary policy|quantitative easing|quantitative tightening|QE|QT)\b/i, weight: 4, riskDirection: 0 },

  // Tariffs / trade war — major macro risk
  { pattern: /\b(tariff|trade war|trade deal|import duty|export ban)\b/i, weight: 5, riskDirection: -1 },

  // War / major geopolitical escalation
  { pattern: /\b(nuclear|world war|invasion|declare war)\b/i, weight: 5, riskDirection: -1 },
  { pattern: /\b(ceasefire|peace deal|peace agreement|de-escalation)\b/i, weight: 4, riskDirection: 1 },
  { pattern: /\b(airstrike|missile strike|bombing|military operation)\b/i, weight: 3, riskDirection: -1 },
  { pattern: /\b(sanctions?)\b/i, weight: 3, riskDirection: -1 },

  // Crypto-specific regulation — direct impact
  { pattern: /\b(bitcoin etf|btc etf|ethereum etf|eth etf|crypto etf)\b/i, weight: 5, riskDirection: 1 },
  { pattern: /\b(crypto ban|bitcoin ban|mining ban)\b/i, weight: 5, riskDirection: -1 },
  { pattern: /\b(sec\s+(sues?|charges?|lawsuit|enforcement|approves?|rejects?))/i, weight: 4, riskDirection: 0 },
  { pattern: /\b(crypto regulation|stablecoin bill|cbdc|digital dollar|digital euro)\b/i, weight: 3, riskDirection: 0 },

  // Market-wide risk events
  { pattern: /\b(bank(ing)? crisis|bank run|bank collapse|svb|credit suisse)\b/i, weight: 4, riskDirection: -1 },
  { pattern: /\b(debt ceiling|government shutdown|default)\b/i, weight: 3, riskDirection: -1 },
  { pattern: /\b(recession|depression|inflation\s+(surge|spike|rise))\b/i, weight: 3, riskDirection: -1 },
  { pattern: /\b(CPI|PPI|non-?farm|unemployment rate|jobs report)\b/i, weight: 3, riskDirection: 0 },

  // Crypto market events
  { pattern: /\b(exchange hack|exchange bankrupt|exchange collapse)\b/i, weight: 5, riskDirection: -1 },
  { pattern: /\b(tether|usdt|usdc)\s+(depeg|collapse|ban)/i, weight: 5, riskDirection: -1 },
  { pattern: /\b(halving|halvening)\b/i, weight: 3, riskDirection: 1 },
];

const MEDIUM_IMPACT_KEYWORDS: KeywordRule[] = [
  { pattern: /\b(bitcoin|btc|ethereum|eth|crypto|cryptocurrency)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(blockchain|defi|web3|nft)\b/i, weight: 1, riskDirection: 0 },
  { pattern: /\b(stock market|s&p 500|nasdaq|dow jones|wall street)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(treasury|bond yield|10-year|2-year)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(dollar index|dxy|gold price|oil price)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(china|russia|iran|north korea)\b/i, weight: 1, riskDirection: 0 },
];

// Keywords that indicate the article is NOT relevant to crypto/markets
const NOISE_PATTERNS: RegExp[] = [
  /\b(sports?|football|soccer|basketball|baseball|nba|nfl|mlb)\b/i,
  /\b(entertainment|movie|film|celebrity|music|album|concert)\b/i,
  /\b(weather|forecast|storm|hurricane|tornado)\b/i,
  /\b(recipe|cooking|restaurant|food)\b/i,
  /\b(local police|traffic|accident|car crash)\b/i,
  /\b(obituar|funeral|memorial service)\b/i,
  // Individual stock / equity news — not relevant to crypto macro
  /\b(shares of|sells? \d[\d,]* shares|buys? \d[\d,]* shares|insider (sell|buy|trad))\b/i,
  /\b(NASDAQ|NYSE):[A-Z]{1,5}\b/,  // Stock ticker like NASDAQ:CART
  /\bshares (up|down|surge|drop|rise|fall)\s+\d/i,
  /\b(dividend|earnings call|quarterly results|EPS|P\/E ratio)\b/i,
  /\b(synagogue|church shooting|school shooting|mass shooting)\b/i,
];

/**
 * Score an article for crypto-price relevance.
 * Returns { relevanceScore: 0-10, impact, riskDirection }
 */
function scoreArticle(title: string, description: string | null): {
  relevanceScore: number;
  impact: NewsImpact;
  riskDirection: number;
} {
  const text = `${title} ${description ?? ''}`;

  // Check noise first — if it matches noise patterns, score very low
  for (const noise of NOISE_PATTERNS) {
    if (noise.test(text)) {
      return { relevanceScore: 0, impact: 'low', riskDirection: 0 };
    }
  }

  let totalWeight = 0;
  let riskSum = 0;

  // High impact keywords
  for (const rule of HIGH_IMPACT_KEYWORDS) {
    if (rule.pattern.test(text)) {
      totalWeight += rule.weight;
      riskSum += rule.riskDirection * rule.weight;
    }
  }

  // Medium impact keywords
  for (const rule of MEDIUM_IMPACT_KEYWORDS) {
    if (rule.pattern.test(text)) {
      totalWeight += rule.weight;
      riskSum += rule.riskDirection * rule.weight;
    }
  }

  // Normalize score to 0-10
  const relevanceScore = Math.min(10, Math.round(totalWeight));

  // Determine impact level
  let impact: NewsImpact;
  if (totalWeight >= 6) impact = 'high';
  else if (totalWeight >= 3) impact = 'medium';
  else impact = 'low';

  // Normalize risk direction to -1..+1
  const riskDirection = totalWeight > 0 ? riskSum / totalWeight : 0;

  return { relevanceScore, impact, riskDirection };
}

// ── Fetching ────────────────────────────────────────────────────────

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
    next: { revalidate: 300 }, // cache 5 minutes (aligned with news-notify cron)
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

  return data.results.filter((item) => {
    const src = (item.source_name || item.source_id || '').toLowerCase();
    return !EXCLUDED_SOURCES.has(src);
  }).map((item) => {
    const { relevanceScore, impact } = scoreArticle(item.title, item.description);
    return {
      title: item.title,
      description: item.description,
      link: item.link,
      source: item.source_name || item.source_id,
      pubDate: item.pubDate,
      pubDateJST: toJST(item.pubDate),
      category: item.category ?? [],
      tag,
      relevanceScore,
      impact,
    };
  });
}

/**
 * Fetch latest risk-relevant news: geopolitical events + crypto regulation.
 * Returns null if API key is not configured or both fetches fail.
 * Articles with relevanceScore < 2 are filtered out (noise removal).
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

    // Dedupe by link AND by normalized title (same story from different sources)
    const seenLinks = new Set<string>();
    const seenTitles = new Set<string>();
    const deduped = all.filter((a) => {
      if (seenLinks.has(a.link)) return false;
      seenLinks.add(a.link);
      // Normalize title: lowercase, strip punctuation, collapse whitespace
      const normTitle = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (seenTitles.has(normTitle)) return false;
      seenTitles.add(normTitle);
      return true;
    });

    // Filter out low-relevance articles (noise) — threshold 4 to exclude single-keyword matches
    const relevant = deduped.filter((a) => a.relevanceScore >= 4);

    // Sort by relevance (high first), then newest
    relevant.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

    return relevant.length > 0 ? relevant : null;
  } catch {
    return null;
  }
}

/**
 * Analyze news articles and produce a market-impact summary.
 * Used by signal.ts to factor news into the trading signal.
 */
export function analyzeNews(articles: NewsArticle[] | null): NewsAnalysis | undefined {
  if (!articles || articles.length === 0) return undefined;

  const highImpact = articles.filter((a) => a.impact === 'high');
  const highImpactCount = highImpact.length;

  // Calculate net risk sentiment from all articles weighted by relevance
  let riskSum = 0;
  let weightSum = 0;
  for (const a of articles) {
    const { riskDirection } = scoreArticle(a.title, a.description);
    riskSum += riskDirection * a.relevanceScore;
    weightSum += a.relevanceScore;
  }

  const sentimentScore = weightSum > 0
    ? Math.max(-1, Math.min(1, riskSum / weightSum))
    : 0;

  let netSentiment: NewsAnalysis['netSentiment'];
  if (sentimentScore <= -0.3) netSentiment = 'risk_off';
  else if (sentimentScore >= 0.3) netSentiment = 'risk_on';
  else netSentiment = 'neutral';

  // Build description
  const parts: string[] = [];
  if (highImpactCount > 0) {
    const titles = highImpact.slice(0, 3).map((a) => a.title.slice(0, 60));
    parts.push(`高影響ニュース${highImpactCount}件: ${titles.join('; ')}`);
  }
  const sentimentLabel = netSentiment === 'risk_off' ? 'リスクオフ' : netSentiment === 'risk_on' ? 'リスクオン' : '中立';
  parts.push(`市場センチメント: ${sentimentLabel} (${sentimentScore.toFixed(2)})`);

  return {
    articles,
    highImpactCount,
    netSentiment,
    sentimentScore,
    description: parts.join(' / '),
  };
}
