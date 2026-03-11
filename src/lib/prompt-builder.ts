import { AnalysisResult } from './types';

function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercent(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(4)}%`;
}

const TIMEFRAME_LABELS: Record<string, string> = {
  '5m': '5分足', '15m': '15分足', '1h': '1時間足', '4h': '4時間足', '1d': '日足',
};
const TREND_LABELS: Record<string, string> = {
  uptrend: '上昇トレンド', downtrend: '下落トレンド', range: 'レンジ',
};
const STRENGTH_LABELS: Record<string, string> = {
  strong: '強い', moderate: '普通', weak: '弱い',
};

export function buildAnalysisPrompt(result: AnalysisResult): string {
  const { marketSummary: ms, trend, levels, longSetup, shortSetup, breakoutLevels, derivatives, indicators, patterns, timeframeDetails, hierarchical } = result;

  const supports = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);
  const resistances = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);

  // Per-timeframe breakdown
  const tfBreakdown = timeframeDetails.map((d) => {
    const tfLabel = TIMEFRAME_LABELS[d.timeframe] || d.timeframe;
    const trendLabel = TREND_LABELS[d.trend.direction];
    const strengthLabel = STRENGTH_LABELS[d.trend.strength];
    const rsi = d.indicators.rsi?.toFixed(1) ?? 'N/A';
    const macdHist = d.indicators.macd ? d.indicators.macd.histogram.toFixed(2) : 'N/A';
    const patternText = d.patterns.length > 0
      ? d.patterns.map((p) => p.label).join(', ')
      : 'なし';

    let extra = '';
    if (d.pullback) {
      extra += `\n- 押し目/戻り: ${d.pullback.description}`;
    }
    if (d.volumeBreakouts && d.volumeBreakouts.length > 0) {
      extra += `\n- 出来高ブレイク: ${d.volumeBreakouts.map((vb) => vb.description).join(', ')}`;
    }
    if (d.falseBreakouts && d.falseBreakouts.length > 0) {
      extra += `\n- ダマシ検出: ${d.falseBreakouts.map((fb) => fb.description).join(', ')}`;
    }
    if (d.wickRejections && d.wickRejections.length > 0) {
      extra += `\n- ヒゲ否定ゾーン: ${d.wickRejections.map((wr) => wr.description).join(', ')}`;
    }
    if (d.volumeSpikes && d.volumeSpikes.length > 0) {
      extra += `\n- 出来高スパイク: ${d.volumeSpikes.map((vs) => vs.description).join(', ')}`;
    }
    if (d.indicators.stochRsi) {
      extra += `\n- StochRSI: K=${d.indicators.stochRsi.k.toFixed(1)} D=${d.indicators.stochRsi.d.toFixed(1)}`;
    }
    if (d.indicators.bollingerBands) {
      extra += `\n- BB: ${d.indicators.bollingerBands.lower.toFixed(0)}-${d.indicators.bollingerBands.upper.toFixed(0)} (中央: ${d.indicators.bollingerBands.middle.toFixed(0)})`;
    }
    if (d.divergences && d.divergences.length > 0) {
      extra += `\n- ダイバージェンス: ${d.divergences.map((dv) => dv.description).join(', ')}`;
    }

    return `### ${tfLabel}
- トレンド: ${trendLabel} (${strengthLabel})
- RSI: ${rsi} / MACD Hist: ${macdHist}
- パターン: ${patternText}
- 高値切り上げ: ${d.trend.higherHighs ? 'はい' : 'いいえ'} / 安値切り上げ: ${d.trend.higherLows ? 'はい' : 'いいえ'}${extra}`;
  }).join('\n\n');

  // Previous day info
  const prevDayInfo = ms.prevDayHigh != null && ms.prevDayLow != null
    ? `\n- 前日高値: $${formatNum(ms.prevDayHigh)} ${ms.currentPrice > ms.prevDayHigh ? '(上回っている→強気)' : '(下回っている)'}\n- 前日安値: $${formatNum(ms.prevDayLow)} ${ms.currentPrice < ms.prevDayLow ? '(下回っている→弱気)' : '(上回っている)'}`
    : '';

  // Hierarchical analysis
  const hierarchicalSection = hierarchical
    ? `\n## 階層的分析 (日足→4h→1h→15m)
- 日足バイアス: ${hierarchical.dailyBias}
- 4h波動: ${hierarchical.h4WavePosition}
- 1h戦略: ${hierarchical.h1Strategy}
- エントリー足: ${hierarchical.entryTimeframe}
- 要約: ${hierarchical.description}`
    : '';

  // Enhanced derivatives
  let derivativesText = `- OI × 価格: ${derivatives.oiPriceDescription}
- Funding偏り: ${derivatives.fundingBias === 'long_heavy' ? 'ロング偏り' : derivatives.fundingBias === 'short_heavy' ? 'ショート偏り' : '中立'}
- Premium: ${derivatives.premiumSignal === 'bullish' ? '強気' : derivatives.premiumSignal === 'bearish' ? '弱気' : '中立'} (${derivatives.premium.toFixed(4)}%)`;

  if (derivatives.oiChange) {
    derivativesText += `\n- OI変化: ${derivatives.oiChange.changePercent > 0 ? '+' : ''}${derivatives.oiChange.changePercent}% (${derivatives.oiChange.direction === 'increasing' ? '増加中' : derivatives.oiChange.direction === 'decreasing' ? '減少中' : '横ばい'})`;
  }
  if (derivatives.fundingTrend) {
    derivativesText += `\n- Funding推移: ${derivatives.fundingTrend.trend === 'rising' ? '上昇傾向' : derivatives.fundingTrend.trend === 'falling' ? '低下傾向' : '横ばい'}${derivatives.fundingTrend.isOverheated ? ' (過熱注意)' : ''}`;
  }
  if (derivatives.markOracleDivergence != null) {
    derivativesText += `\n- Mark/Oracle乖離: ${derivatives.markOracleDivergence.toFixed(4)}%`;
  }

  return `# 暗号通貨トレード分析データ (マルチタイムフレーム)

## ① マーケットデータ要約
- シンボル: ${ms.symbol}
- 分析時間足: ${ms.timeframes.map((tf) => TIMEFRAME_LABELS[tf] || tf).join(', ')}
- 現在価格: $${formatNum(ms.currentPrice)}
- 前日比: ${ms.priceChangePercent >= 0 ? '+' : ''}${ms.priceChangePercent.toFixed(2)}%
- 24h出来高: $${formatNum(ms.volume24h, 0)}
- 建玉 (OI): ${formatNum(ms.openInterest, 0)}
- Funding Rate: ${formatPercent(ms.fundingRate)}
- Premium: ${ms.premium.toFixed(4)}%
- 直近高値: $${formatNum(ms.recentHigh)}
- 直近安値: $${formatNum(ms.recentLow)}${prevDayInfo}

## ② 各時間足の分析

${tfBreakdown}

## ③ 統合トレンド判定
- 方向: ${TREND_LABELS[trend.direction]}
- 強度: ${STRENGTH_LABELS[trend.strength]}
- MA配列: ${trend.maAlignment}
- 高値切り上げ: ${trend.higherHighs ? 'はい' : 'いいえ'}
- 安値切り上げ: ${trend.higherLows ? 'はい' : 'いいえ'}
${hierarchicalSection}

## プライマリ時間足テクニカル指標
- RSI(14): ${indicators.rsi?.toFixed(1) ?? 'N/A'}
- MACD: ${indicators.macd ? `MACD=${indicators.macd.macd.toFixed(2)}, Signal=${indicators.macd.signal.toFixed(2)}, Hist=${indicators.macd.histogram.toFixed(2)}` : 'N/A'}
- EMA20: ${indicators.ema20 ? `$${formatNum(indicators.ema20)}` : 'N/A'}
- EMA50: ${indicators.ema50 ? `$${formatNum(indicators.ema50)}` : 'N/A'}
- SMA200: ${indicators.sma200 ? `$${formatNum(indicators.sma200)}` : 'N/A'}
- VWAP: ${indicators.vwap ? `$${formatNum(indicators.vwap)}` : 'N/A'}
- ADX: ${indicators.adx?.toFixed(1) ?? 'N/A'}
- StochRSI: ${indicators.stochRsi ? `K=${indicators.stochRsi.k.toFixed(1)} D=${indicators.stochRsi.d.toFixed(1)}${indicators.stochRsi.k < 20 ? ' (売られすぎ)' : indicators.stochRsi.k > 80 ? ' (買われすぎ)' : ''}` : 'N/A'}
- BB: ${indicators.bollingerBands ? `${formatNum(indicators.bollingerBands.lower, 0)}-${formatNum(indicators.bollingerBands.upper, 0)}` : 'N/A'}
- ATR(14): ${indicators.atr ? `$${formatNum(indicators.atr)}` : 'N/A'}

## ローソク足パターン
${patterns.length > 0 ? patterns.map((p) => `- ${p.label} (${p.signal === 'bullish' ? '強気' : p.signal === 'bearish' ? '弱気' : '中立'})`).join('\n') : '- 特筆すべきパターンなし'}

## デリバティブ分析
${derivativesText}

## ④ サポート/レジスタンス (統合)
### レジスタンス
${resistances.length > 0 ? resistances.map((r) => `- $${formatNum(r.price)} (強度: ${r.strength}/5, タッチ: ${r.touchCount}回)`).join('\n') : '- なし'}

### サポート
${supports.length > 0 ? supports.map((s) => `- $${formatNum(s.price)} (強度: ${s.strength}/5, タッチ: ${s.touchCount}回)`).join('\n') : '- なし'}

## ⑤ PR比較 (Long vs Short) ※指値ベース
### ロング（押し目買い: サポート付近エントリー）
- エントリー: $${formatNum(longSetup.entry)}
- 損切り: $${formatNum(longSetup.stopLoss)} (${longSetup.riskPercent}%)
- 利確: $${formatNum(longSetup.target)} (${longSetup.rewardPercent}%)
- PR比: ${longSetup.riskRewardRatio}

### ショート（戻り売り: レジスタンス付近エントリー）
- エントリー: $${formatNum(shortSetup.entry)}
- 損切り: $${formatNum(shortSetup.stopLoss)} (${shortSetup.riskPercent}%)
- 利確: $${formatNum(shortSetup.target)} (${shortSetup.rewardPercent}%)
- PR比: ${shortSetup.riskRewardRatio}

## ⑥ 重要分岐点
${breakoutLevels.map((b) => `- $${formatNum(b.price)}: ${b.description}`).join('\n')}

${result.confidence ? `## シグナル信頼度
- スコア: ${result.confidence.score}% (${result.confidence.label})
- 要因: ${result.confidence.factors.map((f) => `${f.positive ? '+' : '-'}${f.contribution} ${f.name}`).join(', ')}` : ''}

${result.topTraderRatio ? `## トップトレーダーL/S比率
- ロング口座: ${(result.topTraderRatio.longAccount * 100).toFixed(1)}%
- ショート口座: ${(result.topTraderRatio.shortAccount * 100).toFixed(1)}%
- L/S比: ${result.topTraderRatio.longShortRatio.toFixed(2)}` : ''}

${result.marketRegime ? `## マーケットレジーム
- 状態: ${result.marketRegime.label} (${result.marketRegime.regime})
- ${result.marketRegime.description}
- BB幅: ${result.marketRegime.bbWidth.toFixed(1)}%, ATR: ${result.marketRegime.atrPercent.toFixed(2)}%, ボラティリティ: ${result.marketRegime.volatilityRank === 'high' ? '高' : result.marketRegime.volatilityRank === 'low' ? '低' : '普通'}` : ''}

${result.volumeProfile ? `## Volume Profile
- POC (最大出来高価格): $${formatNum(result.volumeProfile.poc, 0)}
- Value Area: $${formatNum(result.volumeProfile.valueAreaLow, 0)} - $${formatNum(result.volumeProfile.valueAreaHigh, 0)}
- 現在価格: ${result.volumeProfile.currentPriceVsVA === 'above' ? 'VA上方' : result.volumeProfile.currentPriceVsVA === 'below' ? 'VA下方' : 'VA内'}` : ''}

${result.liquidation && result.liquidation.levels.length > 0 ? `## 清算レベル推定
${result.liquidation.magnetZone ? `- 磁石ゾーン: ${result.liquidation.magnetZone}` : ''}
${result.liquidation.nearestLongLiq ? `- 最寄りロング清算: $${formatNum(result.liquidation.nearestLongLiq, 0)}` : ''}
${result.liquidation.nearestShortLiq ? `- 最寄りショート清算: $${formatNum(result.liquidation.nearestShortLiq, 0)}` : ''}
${result.liquidation.levels.slice(0, 6).map((l) => `- ${l.description}`).join('\n')}` : ''}

${result.orderFlow ? `## オーダーフロー
- ${result.orderFlow.description}
- 全体不均衡: ${(result.orderFlow.imbalance * 100).toFixed(1)}%
- 直近5本不均衡: ${(result.orderFlow.recentImbalance * 100).toFixed(1)}%` : ''}

${result.divergenceAggregation && (result.divergenceAggregation.bullishCount + result.divergenceAggregation.bearishCount > 0) ? `## ダイバージェンス集約
- ${result.divergenceAggregation.description}` : ''}

${result.sentiment ? `## センチメント (Fear & Greed Index)
- ${result.sentiment.description}` : ''}

## ⑦ 結論
${result.conclusionReason}

---
上記のデータに基づいて、以下の観点でトレード判断のアドバイスをお願いします:
1. 各時間足の方向性の一致/不一致の評価
2. 現在のマーケット状況の総合評価（数値群の温度感を含む）
3. マーケットレジームに適した戦略の提案
4. ロングとショートどちらが有利か、その根拠
5. 具体的なエントリー戦略（押し目買い/戻り売り、引きつけ位置、POC/VA基準）
6. 注意すべきリスク要因（OI変化、Funding過熱、清算レベル、オーダーフロー偏り）
7. 重要な価格レベルと、そこを超えた/割れた場合の対応`;
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
