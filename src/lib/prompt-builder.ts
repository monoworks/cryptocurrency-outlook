import { AnalysisResult } from './types';

function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercent(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(4)}%`;
}

export function buildAnalysisPrompt(result: AnalysisResult): string {
  const { marketSummary: ms, trend, levels, longSetup, shortSetup, breakoutLevels, derivatives, indicators, patterns } = result;

  const supports = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);
  const resistances = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);

  const trendLabel = { uptrend: '上昇トレンド', downtrend: '下落トレンド', range: 'レンジ' }[trend.direction];
  const strengthLabel = { strong: '強い', moderate: '普通', weak: '弱い' }[trend.strength];

  return `# 暗号通貨トレード分析データ

## ① マーケットデータ要約
- シンボル: ${ms.symbol}
- 時間足: ${ms.timeframe}
- 現在価格: $${formatNum(ms.currentPrice)}
- 前日比: ${ms.priceChangePercent >= 0 ? '+' : ''}${ms.priceChangePercent.toFixed(2)}%
- 24h出来高: $${formatNum(ms.volume24h, 0)}
- 建玉 (OI): ${formatNum(ms.openInterest, 0)}
- Funding Rate: ${formatPercent(ms.fundingRate)}
- Premium: ${ms.premium.toFixed(4)}%
- 直近高値: $${formatNum(ms.recentHigh)}
- 直近安値: $${formatNum(ms.recentLow)}

## ② トレンド判定
- 方向: ${trendLabel}
- 強度: ${strengthLabel}
- MA配列: ${trend.maAlignment}
- 高値切り上げ: ${trend.higherHighs ? 'はい' : 'いいえ'}
- 安値切り上げ: ${trend.higherLows ? 'はい' : 'いいえ'}

## テクニカル指標
- RSI(14): ${indicators.rsi?.toFixed(1) ?? 'N/A'}
- MACD: ${indicators.macd ? `MACD=${indicators.macd.macd.toFixed(2)}, Signal=${indicators.macd.signal.toFixed(2)}, Hist=${indicators.macd.histogram.toFixed(2)}` : 'N/A'}
- EMA20: ${indicators.ema20 ? `$${formatNum(indicators.ema20)}` : 'N/A'}
- EMA50: ${indicators.ema50 ? `$${formatNum(indicators.ema50)}` : 'N/A'}
- SMA200: ${indicators.sma200 ? `$${formatNum(indicators.sma200)}` : 'N/A'}
- VWAP: ${indicators.vwap ? `$${formatNum(indicators.vwap)}` : 'N/A'}
- ADX: ${indicators.adx?.toFixed(1) ?? 'N/A'}

## ローソク足パターン
${patterns.length > 0 ? patterns.map((p) => `- ${p.label} (${p.signal === 'bullish' ? '強気' : p.signal === 'bearish' ? '弱気' : '中立'})`).join('\n') : '- 特筆すべきパターンなし'}

## デリバティブ分析
- OI × 価格: ${derivatives.oiPriceDescription}
- Funding偏り: ${derivatives.fundingBias === 'long_heavy' ? 'ロング偏り' : derivatives.fundingBias === 'short_heavy' ? 'ショート偏り' : '中立'}
- Premium: ${derivatives.premiumSignal === 'bullish' ? '強気' : derivatives.premiumSignal === 'bearish' ? '弱気' : '中立'} (${derivatives.premium.toFixed(4)}%)

## ③ サポート/レジスタンス
### レジスタンス
${resistances.length > 0 ? resistances.map((r) => `- $${formatNum(r.price)} (強度: ${r.strength}/5, タッチ: ${r.touchCount}回)`).join('\n') : '- なし'}

### サポート
${supports.length > 0 ? supports.map((s) => `- $${formatNum(s.price)} (強度: ${s.strength}/5, タッチ: ${s.touchCount}回)`).join('\n') : '- なし'}

## ④ PR比較 (Long vs Short)
### ロング
- エントリー: $${formatNum(longSetup.entry)}
- 損切り: $${formatNum(longSetup.stopLoss)} (${longSetup.riskPercent}%)
- 利確: $${formatNum(longSetup.target)} (${longSetup.rewardPercent}%)
- PR比: ${longSetup.riskRewardRatio}

### ショート
- エントリー: $${formatNum(shortSetup.entry)}
- 損切り: $${formatNum(shortSetup.stopLoss)} (${shortSetup.riskPercent}%)
- 利確: $${formatNum(shortSetup.target)} (${shortSetup.rewardPercent}%)
- PR比: ${shortSetup.riskRewardRatio}

## ⑤ 重要分岐点
${breakoutLevels.map((b) => `- $${formatNum(b.price)}: ${b.description}`).join('\n')}

## ⑥ 結論
${result.conclusionReason}

---
上記のデータに基づいて、以下の観点でトレード判断のアドバイスをお願いします:
1. 現在のマーケット状況の総合評価
2. ロングとショートどちらが有利か、その根拠
3. 具体的なエントリー戦略（今すぐ入るべきか、引きつけるべきか）
4. 注意すべきリスク要因
5. 重要な価格レベルと、そこを超えた/割れた場合の対応`;
}

export function buildImageAnalysisPrompt(): string {
  return `このチャート画像を分析してください。以下の点を確認し、トレード判断に有用な情報を抽出してください:

1. どの時間足か（5分足、1時間足、4時間足、日足など）
2. 現在値の位置
3. 直近高値・直近安値
4. トレンド方向（上昇/下落/レンジ）
5. ローソク足パターン（包み足、ハンマー、十字線、連続陽線/陰線、上ヒゲ/下ヒゲなど）
6. 出来高の増減傾向
7. 移動平均線やVWAPなどのインジケーターの位置関係
8. 何度も止められている価格帯（サポート/レジスタンス）
9. 重要な分岐点（ここを超えたら上、ここを割れたら下）
10. 総合的なトレード判断（ロング/ショート/様子見）とその根拠

できるだけ具体的な価格レベルを含めて回答してください。`;
}
