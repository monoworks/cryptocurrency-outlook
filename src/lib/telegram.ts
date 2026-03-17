import { AnalysisResult, NewsArticle } from './types';
import { filterUnnotified, markNotified } from './notified-store';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Parse TELEGRAM_CHAT_ID which can be a single ID or comma-separated list.
 */
function getChatIds(): string[] {
  const raw = process.env.TELEGRAM_CHAT_ID;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Send a Telegram message via Bot API.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 * TELEGRAM_CHAT_ID can be comma-separated to send to multiple chats.
 */
async function sendMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = getChatIds();
  if (!token || chatIds.length === 0) return false;

  let anySuccess = false;
  for (const chatId of chatIds) {
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
        console.error(`[Telegram] sendMessage failed for chat ${chatId}: ${res.status}`);
      } else {
        anySuccess = true;
      }
    } catch (err) {
      console.error(`[Telegram] sendMessage error for chat ${chatId}:`, err);
    }
  }
  return anySuccess;
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

/** Format milliseconds to human-readable duration (e.g. "約8時間", "約2日") */
function fmtDuration(ms: number): string {
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `約${hours}時間`;
  const days = Math.round(hours / 24);
  return `約${days}日`;
}

/**
 * Send a trading signal notification to Telegram.
 * Only sends for actionable signals (enter_long / enter_short) by default.
 * Set TELEGRAM_NOTIFY_ALL=true to also notify on wait/skip.
 */
/**
 * Send a batch trading signal notification (multiple symbols in one message).
 */
export async function notifyBatchSignals(results: AnalysisResult[]): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || getChatIds().length === 0) return false;
  if (results.length === 0) return false;

  const lines: string[] = [
    `<b>📊 マルチシンボル分析</b>`,
    ``,
  ];

  for (const result of results) {
    const { marketSummary: ms } = result;
    const isActionable = result.conclusion === 'enter_long' || result.conclusion === 'enter_short';
    const setup = result.conclusion === 'enter_long' ? result.longSetup : result.shortSetup;
    const confidence = result.confidence?.score ?? 0;

    lines.push(`━━━━━━━━━━━━━━━━`);
    lines.push(`<b>${ms.symbol}</b>  ${conclusionLabel(result.conclusion)}`);
    lines.push(`💰 ${fmt(ms.currentPrice, 1)} (${ms.priceChangePercent >= 0 ? '+' : ''}${ms.priceChangePercent.toFixed(2)}%)  📊 信頼度${confidence}`);

    if (isActionable) {
      lines.push(`📍 ${fmt(setup.entry, 1)} → 🎯 ${fmt(setup.target, 1)} / 🛑 ${fmt(setup.stopLoss, 1)}  RR${setup.riskRewardRatio.toFixed(2)}`);
    }

    const holdingLine = setup.suggestedMaxHoldingMs
      ? `  ⏳ ${fmtDuration(setup.suggestedMaxHoldingMs)}`
      : '';
    lines.push(`📈 ${result.trend.direction} (${result.trend.strength})  ⏱ ${ms.timeframes.join(',')}${holdingLine}`);

    if (ms.fundingRate !== 0) {
      lines.push(`💸 FR: ${(ms.fundingRate * 100).toFixed(4)}%`);
    }

    lines.push(`💬 ${result.conclusionReason}`);
    lines.push(``);
  }

  return sendMessage(lines.join('\n'));
}

export async function notifySignal(result: AnalysisResult): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || getChatIds().length === 0) return false;

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

  // Trend & holding time
  lines.push(``);
  lines.push(`📈 トレンド: ${result.trend.direction} (${result.trend.strength})`);
  lines.push(`⏱ 時間足: ${ms.timeframes.join(', ')}`);
  if (isActionable && setup.suggestedMaxHoldingMs) {
    lines.push(`⏳ 決済目安: ${fmtDuration(setup.suggestedMaxHoldingMs)}`);
  }

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

/**
 * Send news alert to Telegram.
 * Uses link-based deduplication (notified-store) to avoid sending the same article twice.
 * Upstash Redis 設定時はデプロイ/コールドスタートを跨いで永続化される。
 * Returns the number of articles notified.
 */
export async function notifyNews(articles: NewsArticle[]): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || getChatIds().length === 0) return 0;
  if (!articles || articles.length === 0) return 0;

  // Filter out already-notified articles (persistent store)
  const fresh = await filterUnnotified(articles);
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
    await markNotified(fresh.map((a) => a.link));
    return fresh.length;
  }
  return 0;
}
