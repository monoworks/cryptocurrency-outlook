import { AnalysisResult, NewsArticle } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Send a Telegram message via Bot API.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 */
async function sendMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error(`[Telegram] sendMessage failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram] sendMessage error:', err);
    return false;
  }
}

/** Map conclusion to emoji + Japanese label */
function conclusionLabel(c: string): string {
  switch (c) {
    case 'enter_long': return '🟢 ロング';
    case 'enter_short': return '🔴 ショート';
    case 'wait': return '🟡 様子見';
    case 'skip': return '⚪ スキップ';
    default: return c;
  }
}

/** Format number with commas */
function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Send a trading signal notification to Telegram.
 * Only sends for actionable signals (enter_long / enter_short) by default.
 * Set TELEGRAM_NOTIFY_ALL=true to also notify on wait/skip.
 */
export async function notifySignal(result: AnalysisResult): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const notifyAll = process.env.TELEGRAM_NOTIFY_ALL === 'true';
  const isActionable = result.conclusion === 'enter_long' || result.conclusion === 'enter_short';

  if (!isActionable && !notifyAll) return false;

  const { marketSummary: ms } = result;
  const setup = result.conclusion === 'enter_long' ? result.longSetup : result.shortSetup;
  const confidence = result.confidence?.score ?? 0;

  const lines: string[] = [
    `<b>${conclusionLabel(result.conclusion)}</b>  ${ms.symbol}`,
    ``,
    `💰 現在価格: <b>${fmt(ms.currentPrice, 1)}</b> (${ms.priceChangePercent >= 0 ? '+' : ''}${ms.priceChangePercent.toFixed(2)}%)`,
    `📊 信頼度: <b>${confidence}/100</b>`,
  ];

  if (isActionable) {
    lines.push(``);
    lines.push(`📍 エントリー: ${fmt(setup.entry, 1)}`);
    lines.push(`🛑 損切り: ${fmt(setup.stopLoss, 1)} (${setup.riskPercent.toFixed(2)}%)`);
    lines.push(`🎯 利確: ${fmt(setup.target, 1)} (${setup.rewardPercent.toFixed(2)}%)`);
    lines.push(`⚖️ RR比: ${setup.riskRewardRatio.toFixed(2)}`);
  }

  // Trend
  lines.push(``);
  lines.push(`📈 トレンド: ${result.trend.direction} (${result.trend.strength})`);
  lines.push(`⏱ 時間足: ${ms.timeframes.join(', ')}`);

  // Derivatives
  if (ms.fundingRate !== 0) {
    lines.push(`💸 FR: ${(ms.fundingRate * 100).toFixed(4)}%`);
  }

  // News headline
  if (result.newsAnalysis && result.newsAnalysis.highImpactCount > 0) {
    lines.push(``);
    lines.push(`📰 ${result.newsAnalysis.description}`);
  }

  // Economic calendar warning
  if (result.economicCalendar && result.economicCalendar.warningLevel !== 'none') {
    lines.push(`⚠️ ${result.economicCalendar.description}`);
  }

  // Reason
  lines.push(``);
  lines.push(`💬 ${result.conclusionReason}`);

  return sendMessage(lines.join('\n'));
}

/** Track notified article links to avoid duplicates (in-memory, resets on deploy) */
const notifiedLinks = new Set<string>();
const MAX_NOTIFIED_LINKS = 500;

/**
 * Send news alert to Telegram.
 * Uses link-based deduplication to avoid sending the same article twice.
 * Returns the number of articles notified.
 */
export async function notifyNews(articles: NewsArticle[]): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return 0;
  if (!articles || articles.length === 0) return 0;

  // Filter out already-notified articles
  const fresh = articles.filter((a) => !notifiedLinks.has(a.link));
  if (fresh.length === 0) return 0;

  const tagLabel = (tag: string) => tag === 'geopolitical' ? '🌍 地政学' : '📋 規制';
  const impactLabel = (impact: string) => {
    switch (impact) {
      case 'high': return '🔴 高';
      case 'medium': return '🟡 中';
      default: return '⚪ 低';
    }
  };

  const lines: string[] = [
    `📰 <b>ニュース速報</b> (${fresh.length}件)`,
    ``,
  ];

  for (const a of fresh) {
    lines.push(`${tagLabel(a.tag)} ${impactLabel(a.impact)} 関連度${a.relevanceScore}/10`);
    lines.push(`<b>${a.title}</b>`);
    lines.push(`${a.source} | ${a.pubDateJST}`);
    lines.push(`${a.link}`);
    lines.push(``);
  }

  const sent = await sendMessage(lines.join('\n'));
  if (sent) {
    for (const a of fresh) {
      notifiedLinks.add(a.link);
    }
    // Prevent unbounded growth
    if (notifiedLinks.size > MAX_NOTIFIED_LINKS) {
      const excess = notifiedLinks.size - MAX_NOTIFIED_LINKS;
      const iter = notifiedLinks.values();
      for (let i = 0; i < excess; i++) {
        notifiedLinks.delete(iter.next().value as string);
      }
    }
    return fresh.length;
  }
  return 0;
}
