import { XMLParser } from 'fast-xml-parser';
import { NewsArticle, NewsAnalysis, NewsImpact, NewsTag } from './types';

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

  // ── Japanese keywords (CoinTelegraph JP) ──
  // Fed / interest rates
  { pattern: /(連邦準備|FRB|パウエル|利下げ|利上げ|金利)/, weight: 5, riskDirection: 0 },
  { pattern: /利下げ/, weight: 5, riskDirection: 1 },
  { pattern: /利上げ/, weight: 5, riskDirection: -1 },
  { pattern: /(FOMC|金融政策|量的緩和|量的引き締め)/, weight: 4, riskDirection: 0 },
  // Tariffs / trade war
  { pattern: /(関税|貿易戦争|貿易摩擦|輸入規制|輸出規制)/, weight: 5, riskDirection: -1 },
  // War / geopolitical
  { pattern: /(核|世界大戦|侵攻|宣戦布告)/, weight: 5, riskDirection: -1 },
  { pattern: /(停戦|和平|平和合意)/, weight: 4, riskDirection: 1 },
  { pattern: /(空爆|ミサイル|爆撃|軍事作戦|制裁)/, weight: 3, riskDirection: -1 },
  // Crypto regulation
  { pattern: /(ビットコインETF|イーサリアムETF|仮想通貨ETF|暗号資産ETF)/, weight: 5, riskDirection: 1 },
  { pattern: /(仮想通貨禁止|暗号資産禁止|マイニング禁止)/, weight: 5, riskDirection: -1 },
  { pattern: /(SEC|証券取引委員会).*(訴訟|起訴|承認|却下)/, weight: 4, riskDirection: 0 },
  { pattern: /(仮想通貨規制|暗号資産規制|ステーブルコイン法案|CBDC|デジタル通貨)/, weight: 3, riskDirection: 0 },
  // Market-wide risk
  { pattern: /(銀行危機|銀行破綻|取り付け騒ぎ)/, weight: 4, riskDirection: -1 },
  { pattern: /(債務上限|政府閉鎖|デフォルト|景気後退|リセッション)/, weight: 3, riskDirection: -1 },
  // Crypto market events
  { pattern: /(取引所ハッキング|取引所破綻|取引所閉鎖)/, weight: 5, riskDirection: -1 },
  { pattern: /(テザー|USDT|USDC).*(デペッグ|崩壊|禁止)/, weight: 5, riskDirection: -1 },
  { pattern: /(半減期)/, weight: 3, riskDirection: 1 },
];

const MEDIUM_IMPACT_KEYWORDS: KeywordRule[] = [
  { pattern: /\b(bitcoin|btc|ethereum|eth|crypto|cryptocurrency)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(blockchain|defi|web3|nft)\b/i, weight: 1, riskDirection: 0 },
  { pattern: /\b(stock market|s&p 500|nasdaq|dow jones|wall street)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(treasury|bond yield|10-year|2-year)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(dollar index|dxy|gold price|oil price)\b/i, weight: 2, riskDirection: 0 },
  { pattern: /\b(china|russia|iran|north korea)\b/i, weight: 1, riskDirection: 0 },
  // Japanese
  { pattern: /(ビットコイン|イーサリアム|仮想通貨|暗号資産)/, weight: 2, riskDirection: 0 },
  { pattern: /(ブロックチェーン|DeFi|NFT)/, weight: 1, riskDirection: 0 },
  { pattern: /(株式市場|ナスダック|ダウ|ウォール街)/, weight: 2, riskDirection: 0 },
  { pattern: /(米国債|国債利回り)/, weight: 2, riskDirection: 0 },
  { pattern: /(ドル指数|金価格|原油価格)/, weight: 2, riskDirection: 0 },
  { pattern: /(中国|ロシア|イラン|北朝鮮)/, weight: 1, riskDirection: 0 },
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
  // Japanese noise
  /(スポーツ|サッカー|野球|バスケ|テニス|オリンピック)/,
  /(映画|芸能|音楽|アルバム|コンサート)/,
  /(天気|台風|地震速報|津波警報)/,
  /(レシピ|料理|グルメ|レストラン)/,
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

// ── RSS Feeds ─────────────────────────────────────────────────────────

const RSS_FEEDS: { url: string; source: string; tag: NewsTag; official?: boolean }[] = [
  // Crypto media (日本語)
  { url: 'https://jp.cointelegraph.com/rss', source: 'CoinTelegraph JP', tag: 'crypto' },
  { url: 'https://jp.cointelegraph.com/rss/tag/regulation', source: 'CoinTelegraph JP', tag: 'crypto' },
  { url: 'https://jp.cointelegraph.com/rss/tag/bitcoin', source: 'CoinTelegraph JP', tag: 'crypto' },
  { url: 'https://thedefiant.io/api/feed', source: 'The Defiant', tag: 'crypto' },
  // Geopolitical / macro (Google News RSS)
  { url: 'https://news.google.com/rss/search?q=war+OR+sanctions+OR+missile+OR+military+OR+geopolitical&hl=en&gl=US&ceid=US:en', source: 'Google News', tag: 'geopolitical' },
  { url: 'https://news.google.com/rss/search?q=Federal+Reserve+OR+interest+rate+OR+tariff+OR+trade+war&hl=en&gl=US&ceid=US:en', source: 'Google News', tag: 'geopolitical' },
  // Official regulatory
  { url: 'https://www.sec.gov/news/pressreleases.rss', source: 'SEC', tag: 'crypto', official: true },
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Federal Reserve', tag: 'geopolitical', official: true },
  { url: 'https://www.cftc.gov/Newsroom/PressReleases/RSS', source: 'CFTC', tag: 'crypto', official: true },
];

/** Score boost for official/primary regulatory sources */
const OFFICIAL_SOURCE_BOOST = 2;

/**
 * Noise patterns for official regulatory RSS feeds.
 * These match routine supervisory/administrative actions that do not
 * affect crypto markets or macro conditions.
 */
const RSS_NOISE_PATTERNS: RegExp[] = [
  // Fed routine bank supervision & administrative
  /\bannounces approval of (application|notice) by\b/i,
  /\bissues enforcement actions? with (former )?employee of\b/i,
  /\bannounces termination of enforcement actions?\b/i,
  /\bannounces (approval|denial) of.* (bank|bancorp|banc|savings|credit union|holding company)\b/i,
  /\bsupervision of banks\b/i,
  /\bpublic outreach meeting\b/i,
  /\bregulatory paperwork reduction\b/i,
  /\b(stress test|capital requirements).*(scenario|feedback|hypothetical)\b/i,
  /\brequests comment on (proposal|rule)\b/i,
  // SEC routine individual/company enforcement (not crypto-related)
  /\bcharges .* (insider trading in|accounting fraud|auditing violations)\b/i,
  // Generic administrative filings
  /\b(board meeting|advisory committee|public meeting|sunshine act)\b/i,
];

const xmlParser = new XMLParser({ ignoreAttributes: false });

/**
 * Fetch and parse RSS feeds from all configured sources.
 * Each feed is fetched independently — one failure does not block others.
 */
async function fetchRSSFeeds(): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { Accept: 'application/xml, text/xml, application/rss+xml' },
        next: { revalidate: 300 },
      });
      if (!res.ok) {
        console.error(`[RSS:${feed.source}] HTTP ${res.status}`);
        return [];
      }

      const xml = await res.text();
      const parsed = xmlParser.parse(xml);

      // Handle RSS 2.0 (rss.channel.item) and Atom (feed.entry)
      let items: { title?: string; description?: string; link?: string; pubDate?: string; updated?: string }[] = [];
      if (parsed.rss?.channel?.item) {
        const raw = parsed.rss.channel.item;
        items = Array.isArray(raw) ? raw : [raw];
      } else if (parsed.feed?.entry) {
        const raw = parsed.feed.entry;
        items = (Array.isArray(raw) ? raw : [raw]).map((e: Record<string, unknown>) => ({
          title: e.title as string,
          description: (e.summary ?? e.content) as string,
          link: typeof e.link === 'object' && e.link !== null ? (e.link as Record<string, string>)['@_href'] : e.link as string,
          pubDate: (e.updated ?? e.published) as string,
        }));
      }

      const isOfficial = feed.official === true;

      return items
        .filter((item) => {
          if (!item.title || !item.link) return false;
          // Filter out routine regulatory noise (official feeds only)
          if (isOfficial) {
            const text = `${item.title} ${item.description ?? ''}`;
            if (RSS_NOISE_PATTERNS.some((p) => p.test(text))) return false;
          }
          return true;
        })
        .slice(0, 10)
        .map((item): NewsArticle => {
          const title = String(item.title);
          const description = item.description ? String(item.description) : null;
          const { relevanceScore: baseScore, impact: baseImpact } = scoreArticle(title, description);

          // Apply official source boost for regulatory feeds
          const boost = isOfficial ? OFFICIAL_SOURCE_BOOST : 0;
          const relevanceScore = Math.min(10, baseScore + boost);
          let impact: NewsImpact;
          if (relevanceScore >= 6) impact = 'high';
          else if (relevanceScore >= 3) impact = 'medium';
          else impact = baseImpact;

          const pubDate = String(item.pubDate ?? item.updated ?? '');

          return {
            title,
            description,
            link: String(item.link),
            source: feed.source,
            pubDate,
            pubDateJST: toJST(pubDate),
            category: [],
            tag: feed.tag,
            relevanceScore,
            impact,
          };
        });
    }),
  );

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// ── Fetching ────────────────────────────────────────────────────────

/**
 * Fetch latest risk-relevant news from RSS feeds.
 * Sources: crypto media (CoinTelegraph, The Defiant) + official regulatory (SEC, Fed, CFTC).
 * Returns null if all sources fail or no relevant articles found.
 */
export async function fetchNews(): Promise<NewsArticle[] | null> {
  try {
    const all = await fetchRSSFeeds();
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
