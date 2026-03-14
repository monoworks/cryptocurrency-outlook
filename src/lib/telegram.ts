import { AnalysisResult } from './types';

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
