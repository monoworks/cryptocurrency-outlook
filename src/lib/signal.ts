import {
  MarketData,
  AnalysisResult,
  TradeSetup,
  BreakoutLevel,
  SignalConclusion,
  SignalConfidence,
  PriceLevel,
  TrendAnalysis,
  TrendDirection,
  TrendStrength,
  DerivativesAnalysis,
  DerivativesHistory,
  Timeframe,
  TimeframeAnalysis,
  OHLCV,
  HierarchicalAnalysis,
  MarketBias,
  TopTraderRatio,
  DivergenceAggregation,
  FearGreedData,
} from './types';
import { calcIndicators } from './indicators';
import { detectPatterns, detectFalseBreakouts, detectWickRejections, detectVolumeSpikes } from './patterns';
import { analyzeTrend, analyzePullback, detectRetest } from './trend';
import { detectSupportResistance, detectVolumeBreakouts } from './support-resistance';
import { analyzeDerivatives } from './derivatives';
import { detectDivergences } from './divergence';
import { classifyMarketRegime } from './market-regime';
import { buildVolumeProfile } from './volume-profile';
import { estimateLiquidationLevels } from './liquidation';
import { analyzeOrderFlow } from './order-flow';
import { analyzeSentiment } from './sentiment';

// Weight for each timeframe (higher = more influence on combined result)
const TIMEFRAME_WEIGHT: Record<Timeframe, number> = {
  '5m': 1,
  '15m': 1.5,
  '1h': 2,
  '4h': 3,
  '1d': 4,
};

function findNearestSupport(levels: PriceLevel[], currentPrice: number): number {
  const supports = levels
    .filter((l) => l.type === 'support')
    .sort((a, b) => b.price - a.price);
  return supports.length > 0 ? supports[0].price : currentPrice * 0.97;
}

function findNearestResistance(levels: PriceLevel[], currentPrice: number): number {
  const resistances = levels
    .filter((l) => l.type === 'resistance')
    .sort((a, b) => a.price - b.price);
  return resistances.length > 0 ? resistances[0].price : currentPrice * 1.03;
}

function buildTradeSetup(
  direction: 'long' | 'short',
  currentPrice: number,
  nearestSupport: number,
  nearestResistance: number,
  atr: number | null
): TradeSetup {
  // Use 1.5x ATR for SL, fallback to 0.2% of entry if ATR unavailable
  const slMultiplier = 1.5;

  if (direction === 'long') {
    const entry = nearestSupport;
    const slOffset = atr ? atr * slMultiplier : entry * 0.002;
    const stopLoss = entry - slOffset;
    const target = nearestResistance;
    const risk = entry - stopLoss;
    const reward = target - entry;
    return {
      direction: 'long',
      entry: Math.round(entry * 100) / 100,
      stopLoss: Math.round(stopLoss * 100) / 100,
      target: Math.round(target * 100) / 100,
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      riskPercent: Math.round(((entry - stopLoss) / entry) * 10000) / 100,
      rewardPercent: Math.round(((target - entry) / entry) * 10000) / 100,
    };
  } else {
    const entry = nearestResistance;
    const slOffset = atr ? atr * slMultiplier : entry * 0.002;
    const stopLoss = entry + slOffset;
    const target = nearestSupport;
    const risk = stopLoss - entry;
    const reward = entry - target;
    return {
      direction: 'short',
      entry: Math.round(entry * 100) / 100,
      stopLoss: Math.round(stopLoss * 100) / 100,
      target: Math.round(target * 100) / 100,
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      riskPercent: Math.round(((stopLoss - entry) / entry) * 10000) / 100,
      rewardPercent: Math.round(((entry - target) / entry) * 10000) / 100,
    };
  }
}

function analyzeTimeframe(
  timeframe: Timeframe,
  candles: OHLCV[],
  currentPrice: number
): TimeframeAnalysis {
  const indicators = calcIndicators(candles);
  const patterns = detectPatterns(candles);
  const trend = analyzeTrend(candles, indicators);
  const levels = detectSupportResistance(candles, currentPrice);
  const recent20 = candles.slice(-20);
  const recentHigh = Math.max(...recent20.map((c) => c.high));
  const recentLow = Math.min(...recent20.map((c) => c.low));

  // Volume breakout detection
  const volumeBreakouts = detectVolumeBreakouts(candles, levels);

  // Pullback / Fibonacci analysis
  let pullback = analyzePullback(candles, trend);
  pullback = detectRetest(candles, levels, pullback);

  // False breakout detection
  const falseBreakouts = detectFalseBreakouts(candles, levels);

  // Wick rejection zones
  const wickRejections = detectWickRejections(candles);

  // Volume spikes
  const volumeSpikes = detectVolumeSpikes(candles);

  // Divergence detection (RSI / MACD)
  const divergences = detectDivergences(candles);

  // Previous day high/low (only meaningful for daily candles)
  let prevDayHigh: number | undefined;
  let prevDayLow: number | undefined;
  if (timeframe === '1d' && candles.length >= 2) {
    const prevCandle = candles[candles.length - 2];
    prevDayHigh = prevCandle.high;
    prevDayLow = prevCandle.low;
  }

  return {
    timeframe, trend, indicators, patterns, levels,
    recentHigh, recentLow,
    volumeBreakouts,
    pullback,
    prevDayHigh, prevDayLow,
    falseBreakouts,
    wickRejections,
    volumeSpikes,
    divergences,
  };
}

function combineTrends(details: TimeframeAnalysis[]): TrendAnalysis {
  let uptrendWeight = 0;
  let downtrendWeight = 0;
  let totalWeight = 0;
  let adxSum = 0;
  let adxWeightSum = 0;

  for (const d of details) {
    const w = TIMEFRAME_WEIGHT[d.timeframe];
    totalWeight += w;
    if (d.trend.direction === 'uptrend') uptrendWeight += w;
    if (d.trend.direction === 'downtrend') downtrendWeight += w;
    if (d.indicators.adx != null) {
      adxSum += d.indicators.adx * w;
      adxWeightSum += w;
    }
  }

  let direction: TrendDirection;
  const upRatio = uptrendWeight / totalWeight;
  const downRatio = downtrendWeight / totalWeight;
  if (upRatio > 0.5) direction = 'uptrend';
  else if (downRatio > 0.5) direction = 'downtrend';
  else direction = 'range';

  const avgAdx = adxWeightSum > 0 ? adxSum / adxWeightSum : 20;
  let strength: TrendStrength;
  if (avgAdx >= 30) strength = 'strong';
  else if (avgAdx >= 20) strength = 'moderate';
  else strength = 'weak';

  // MA alignment from highest weighted timeframe
  const primary = details[details.length - 1];

  // Higher highs / higher lows: true if majority agree
  const hhCount = details.filter((d) => d.trend.higherHighs).length;
  const hlCount = details.filter((d) => d.trend.higherLows).length;

  return {
    direction,
    strength,
    maAlignment: primary.trend.maAlignment,
    higherHighs: hhCount > details.length / 2,
    higherLows: hlCount > details.length / 2,
  };
}

function mergeLevels(details: TimeframeAnalysis[], currentPrice: number): PriceLevel[] {
  const allLevels: PriceLevel[] = [];

  for (const d of details) {
    const tfWeight = TIMEFRAME_WEIGHT[d.timeframe];
    for (const level of d.levels) {
      allLevels.push({
        ...level,
        // Boost strength by timeframe weight (higher TF = stronger level)
        strength: Math.min(5, Math.round(level.strength * (tfWeight / 2))),
      });
    }
  }

  // Cluster nearby levels (within 0.3%)
  const threshold = currentPrice * 0.003;
  const clustered: PriceLevel[] = [];

  const sorted = allLevels.sort((a, b) => a.price - b.price);
  for (const level of sorted) {
    const existing = clustered.find((c) => Math.abs(c.price - level.price) < threshold && c.type === level.type);
    if (existing) {
      existing.strength = Math.min(5, existing.strength + 1);
      existing.touchCount += level.touchCount;
      existing.price = (existing.price + level.price) / 2; // average price
    } else {
      clustered.push({ ...level });
    }
  }

  return clustered.sort((a, b) => b.strength - a.strength).slice(0, 15);
}

/**
 * Hierarchical analysis: Daily → 4H → 1H → 15m
 * Determines market bias from top-down perspective.
 */
function buildHierarchicalAnalysis(details: TimeframeAnalysis[]): HierarchicalAnalysis | undefined {
  const byTf = new Map(details.map((d) => [d.timeframe, d]));
  const daily = byTf.get('1d');
  const h4 = byTf.get('4h');
  const h1 = byTf.get('1h');
  const m15 = byTf.get('15m');

  if (!daily) return undefined;

  // Step 1: Daily bias
  let dailyBias: MarketBias = 'neutral';
  const dTrend = daily.trend;
  if (dTrend.direction === 'uptrend' && dTrend.strength === 'strong') dailyBias = 'strongly_bullish';
  else if (dTrend.direction === 'uptrend') dailyBias = 'bullish';
  else if (dTrend.direction === 'downtrend' && dTrend.strength === 'strong') dailyBias = 'strongly_bearish';
  else if (dTrend.direction === 'downtrend') dailyBias = 'bearish';

  // Step 2: 4H wave position
  let h4WavePosition = '不明';
  if (h4) {
    const h4Trend = h4.trend;
    if (h4Trend.higherHighs && h4Trend.higherLows) {
      h4WavePosition = '高値安値切り上げ中（上昇波継続）';
    } else if (!h4Trend.higherHighs && !h4Trend.higherLows) {
      h4WavePosition = '高値安値切り下げ中（下落波継続）';
    } else if (h4.pullback) {
      h4WavePosition = `${h4.pullback.description}`;
    } else {
      h4WavePosition = h4Trend.direction === 'range' ? 'レンジ内推移' : '方向転換の可能性';
    }
  }

  // Step 3: 1H strategy
  let h1Strategy = '様子見';
  if (h1) {
    const bullish = dailyBias === 'bullish' || dailyBias === 'strongly_bullish';
    const bearish = dailyBias === 'bearish' || dailyBias === 'strongly_bearish';

    if (bullish && h1.pullback && h1.pullback.depth !== 'deep') {
      h1Strategy = '押し目買い待ち';
    } else if (bullish && h1.trend.direction === 'uptrend') {
      h1Strategy = '上昇トレンド継続 — ブレイクアウト or 押し目買い';
    } else if (bearish && h1.pullback && h1.pullback.depth !== 'deep') {
      h1Strategy = '戻り売り待ち';
    } else if (bearish && h1.trend.direction === 'downtrend') {
      h1Strategy = '下落トレンド継続 — 戻り売り';
    } else if (dailyBias === 'neutral') {
      h1Strategy = 'レンジ戦略 — 上限売り/下限買い';
    } else {
      h1Strategy = '方向性と短期足が不一致 — 様子見推奨';
    }
  }

  // Step 4: Entry timeframe summary
  let entryTimeframe = '15分足で指値位置を確定';
  if (m15 && m15.pullback?.retestDetected) {
    entryTimeframe = `15分足リテスト確認済み — $${m15.pullback.retestLevel?.toLocaleString()} 付近`;
  }

  // Build description
  const biasLabels: Record<MarketBias, string> = {
    strongly_bullish: '強い強気',
    bullish: '強気',
    neutral: '中立',
    bearish: '弱気',
    strongly_bearish: '強い弱気',
  };

  const description = [
    `日足: ${biasLabels[dailyBias]}`,
    `4h: ${h4WavePosition}`,
    `1h戦略: ${h1Strategy}`,
    entryTimeframe,
  ].join(' → ');

  return { dailyBias, h4WavePosition, h1Strategy, entryTimeframe, description };
}

function determineConclusion(
  trend: TrendAnalysis,
  derivatives: DerivativesAnalysis,
  details: TimeframeAnalysis[],
  longSetup: TradeSetup,
  shortSetup: TradeSetup,
  hierarchical?: HierarchicalAnalysis,
  orderFlowData?: { imbalance: number },
  sentimentSignal?: string,
): { conclusion: SignalConclusion; reason: string } {
  let bullishScore = 0;
  let bearishScore = 0;
  let totalWeight = 0;

  // Per-timeframe weighted scoring
  for (const d of details) {
    const w = TIMEFRAME_WEIGHT[d.timeframe];
    totalWeight += w;

    // Trend per TF
    if (d.trend.direction === 'uptrend') bullishScore += 2 * w;
    if (d.trend.direction === 'downtrend') bearishScore += 2 * w;

    // RSI per TF
    if (d.indicators.rsi != null) {
      if (d.indicators.rsi < 30) bullishScore += 1 * w;
      if (d.indicators.rsi > 70) bearishScore += 1 * w;
      if (d.indicators.rsi > 50 && d.indicators.rsi < 70) bullishScore += 0.5 * w;
      if (d.indicators.rsi < 50 && d.indicators.rsi > 30) bearishScore += 0.5 * w;
    }

    // MACD per TF
    if (d.indicators.macd) {
      if (d.indicators.macd.histogram > 0) bullishScore += 1 * w;
      else bearishScore += 1 * w;
    }

    // Patterns per TF
    for (const p of d.patterns) {
      if (p.signal === 'bullish') bullishScore += 0.5 * w;
      if (p.signal === 'bearish') bearishScore += 0.5 * w;
    }

    // Volume breakouts boost
    if (d.volumeBreakouts) {
      for (const vb of d.volumeBreakouts) {
        if (vb.direction === 'bullish') bullishScore += 1 * w;
        if (vb.direction === 'bearish') bearishScore += 1 * w;
      }
    }

    // False breakouts (counter-signal: fakeout upside = bearish, fakeout downside = bullish)
    if (d.falseBreakouts) {
      for (const fb of d.falseBreakouts) {
        if (fb.direction === 'upside_fakeout') bearishScore += 0.5 * w;
        if (fb.direction === 'downside_fakeout') bullishScore += 0.5 * w;
      }
    }

    // Volume spikes in trend direction reinforce
    if (d.volumeSpikes) {
      for (const vs of d.volumeSpikes) {
        const boost = Math.min(vs.volumeRatio / 4, 0.5); // cap at 0.5
        if (vs.priceDirection === 'up') bullishScore += boost * w;
        else bearishScore += boost * w;
      }
    }

    // Bollinger Band extreme positions
    if (d.indicators.bollingerBands) {
      const bb = d.indicators.bollingerBands;
      const price = d.recentHigh; // approximate current
      if (price > bb.upper) bearishScore += 0.3 * w; // overbought
      if (price < bb.lower) bullishScore += 0.3 * w; // oversold
    }

    // Stochastic RSI
    if (d.indicators.stochRsi) {
      if (d.indicators.stochRsi.k < 20 && d.indicators.stochRsi.d < 20) bullishScore += 0.5 * w;
      if (d.indicators.stochRsi.k > 80 && d.indicators.stochRsi.d > 80) bearishScore += 0.5 * w;
    }

    // Divergences
    if (d.divergences) {
      for (const div of d.divergences) {
        if (div.type === 'bullish') bullishScore += 1.5 * w;
        if (div.type === 'bearish') bearishScore += 1.5 * w;
        if (div.type === 'hidden_bullish') bullishScore += 0.8 * w;
        if (div.type === 'hidden_bearish') bearishScore += 0.8 * w;
      }
    }
  }

  // Normalize by total weight
  bullishScore /= totalWeight;
  bearishScore /= totalWeight;

  // Derivatives (not per-TF, add directly)
  if (derivatives.oiPriceSignal === 'new_longs') bullishScore += 1;
  if (derivatives.oiPriceSignal === 'new_shorts') bearishScore += 1;
  if (derivatives.oiPriceSignal === 'short_cover') bullishScore += 0.5;
  if (derivatives.oiPriceSignal === 'long_liquidation') bearishScore += 0.5;
  if (derivatives.fundingBias === 'long_heavy') bearishScore += 0.5;
  if (derivatives.fundingBias === 'short_heavy') bullishScore += 0.5;

  // OI change bonus (real data)
  if (derivatives.oiChange) {
    if (derivatives.oiChange.direction === 'increasing' && derivatives.oiPriceSignal === 'new_longs') {
      bullishScore += 0.5;
    }
    if (derivatives.oiChange.direction === 'increasing' && derivatives.oiPriceSignal === 'new_shorts') {
      bearishScore += 0.5;
    }
  }

  // Funding trend overheating penalty
  if (derivatives.fundingTrend?.isOverheated) {
    if (derivatives.fundingTrend.current > 0) bearishScore += 0.5; // too many longs = bearish signal
    else bullishScore += 0.5; // too many shorts = bullish signal
  }

  // Hierarchical bias bonus
  if (hierarchical) {
    if (hierarchical.dailyBias === 'strongly_bullish') bullishScore += 1;
    else if (hierarchical.dailyBias === 'bullish') bullishScore += 0.5;
    else if (hierarchical.dailyBias === 'strongly_bearish') bearishScore += 1;
    else if (hierarchical.dailyBias === 'bearish') bearishScore += 0.5;
  }

  // Order flow imbalance
  if (orderFlowData) {
    if (orderFlowData.imbalance > 0.06) bullishScore += 0.5;
    else if (orderFlowData.imbalance < -0.06) bearishScore += 0.5;
  }

  // Sentiment contrarian signal
  if (sentimentSignal === 'contrarian_bullish') bullishScore += 0.3;
  else if (sentimentSignal === 'contrarian_bearish') bearishScore += 0.3;

  const diff = bullishScore - bearishScore;
  const bestRR = Math.max(longSetup.riskRewardRatio, shortSetup.riskRewardRatio);

  // Build timeframe agreement description
  const tfLabels = details.map((d) => {
    const dir = d.trend.direction === 'uptrend' ? '↑' : d.trend.direction === 'downtrend' ? '↓' : '→';
    return `${d.timeframe}${dir}`;
  }).join(' / ');

  let conclusion: SignalConclusion;
  let reason: string;

  if (Math.abs(diff) < 1) {
    conclusion = 'skip';
    reason = `強気/弱気シグナルが拮抗 (強気${bullishScore.toFixed(1)} vs 弱気${bearishScore.toFixed(1)})。[${tfLabels}] 明確な方向性が出るまで見送り推奨。`;
  } else if (bestRR < 1.5) {
    conclusion = 'wait';
    reason = `方向性はあるが、現在のPR比(${bestRR})が低い。[${tfLabels}] 引きつけてからのエントリー推奨。`;
  } else if (diff >= 2) {
    conclusion = 'enter_long';
    reason = `強気シグナル優勢 (${bullishScore.toFixed(1)} vs ${bearishScore.toFixed(1)})。[${tfLabels}] ロングのPR比${longSetup.riskRewardRatio}。`;
  } else if (diff <= -2) {
    conclusion = 'enter_short';
    reason = `弱気シグナル優勢 (弱気${bearishScore.toFixed(1)} vs 強気${bullishScore.toFixed(1)})。[${tfLabels}] ショートのPR比${shortSetup.riskRewardRatio}。`;
  } else if (diff > 0) {
    conclusion = 'wait';
    reason = `やや強気だが確信度不十分 (${bullishScore.toFixed(1)} vs ${bearishScore.toFixed(1)})。[${tfLabels}] 押し目を待ってロング検討。`;
  } else {
    conclusion = 'wait';
    reason = `やや弱気だが確信度不十分 (弱気${bearishScore.toFixed(1)} vs 強気${bullishScore.toFixed(1)})。[${tfLabels}] 戻りを待ってショート検討。`;
  }

  // Append hierarchical insight
  if (hierarchical) {
    reason += ` [階層分析: ${hierarchical.description}]`;
  }

  return { conclusion, reason };
}

function calcConfidence(
  trend: TrendAnalysis,
  details: TimeframeAnalysis[],
  derivatives: DerivativesAnalysis,
  longSetup: TradeSetup,
  shortSetup: TradeSetup,
  hierarchical?: HierarchicalAnalysis,
  topTraderRatio?: TopTraderRatio,
): SignalConfidence {
  const factors: SignalConfidence['factors'] = [];
  let score = 50; // base

  // 1. Timeframe alignment (up to +20 / -10)
  const directions = details.map((d) => d.trend.direction);
  const allSame = directions.every((d) => d === directions[0]);
  const majorityUp = directions.filter((d) => d === 'uptrend').length > directions.length / 2;
  const majorityDown = directions.filter((d) => d === 'downtrend').length > directions.length / 2;
  if (allSame && directions[0] !== 'range') {
    score += 20;
    factors.push({ name: '全時間足一致', contribution: 20, positive: true });
  } else if (majorityUp || majorityDown) {
    score += 10;
    factors.push({ name: '多数時間足一致', contribution: 10, positive: true });
  } else {
    score -= 10;
    factors.push({ name: '時間足不一致', contribution: 10, positive: false });
  }

  // 2. Trend strength (+10 or -5)
  if (trend.strength === 'strong') {
    score += 10;
    factors.push({ name: 'トレンド強い', contribution: 10, positive: true });
  } else if (trend.strength === 'weak') {
    score -= 5;
    factors.push({ name: 'トレンド弱い', contribution: 5, positive: false });
  }

  // 3. Risk/Reward ratio (+10 if good)
  const bestRR = Math.max(longSetup.riskRewardRatio, shortSetup.riskRewardRatio);
  if (bestRR >= 3) {
    score += 10;
    factors.push({ name: 'RR比良好 (≥3)', contribution: 10, positive: true });
  } else if (bestRR >= 2) {
    score += 5;
    factors.push({ name: 'RR比まずまず (≥2)', contribution: 5, positive: true });
  } else if (bestRR < 1.5) {
    score -= 5;
    factors.push({ name: 'RR比不良 (<1.5)', contribution: 5, positive: false });
  }

  // 4. Divergences (+10 for confirming, -5 for conflicting)
  const allDivs = details.flatMap((d) => d.divergences ?? []);
  const bullishDivs = allDivs.filter((d) => d.type === 'bullish' || d.type === 'hidden_bullish');
  const bearishDivs = allDivs.filter((d) => d.type === 'bearish' || d.type === 'hidden_bearish');
  if (bullishDivs.length > 0 && trend.direction === 'downtrend') {
    score += 10;
    factors.push({ name: '強気ダイバージェンス（反転示唆）', contribution: 10, positive: true });
  }
  if (bearishDivs.length > 0 && trend.direction === 'uptrend') {
    score += 10;
    factors.push({ name: '弱気ダイバージェンス（反転示唆）', contribution: 10, positive: true });
  }

  // 5. Derivatives confirmation (+5 or -5)
  if (derivatives.oiPriceSignal === 'new_longs' && trend.direction === 'uptrend') {
    score += 5;
    factors.push({ name: 'OI×価格がトレンド確認', contribution: 5, positive: true });
  } else if (derivatives.oiPriceSignal === 'new_shorts' && trend.direction === 'downtrend') {
    score += 5;
    factors.push({ name: 'OI×価格がトレンド確認', contribution: 5, positive: true });
  }
  if (derivatives.fundingTrend?.isOverheated) {
    score -= 5;
    factors.push({ name: 'Funding過熱', contribution: 5, positive: false });
  }

  // 6. Top trader ratio (+5 if aligned)
  if (topTraderRatio) {
    if (topTraderRatio.longShortRatio > 1.5 && trend.direction === 'uptrend') {
      score += 5;
      factors.push({ name: 'トップトレーダーがロング優勢', contribution: 5, positive: true });
    } else if (topTraderRatio.longShortRatio < 0.67 && trend.direction === 'downtrend') {
      score += 5;
      factors.push({ name: 'トップトレーダーがショート優勢', contribution: 5, positive: true });
    }
  }

  // 7. Hierarchical alignment (+5)
  if (hierarchical) {
    const bullBias = hierarchical.dailyBias === 'bullish' || hierarchical.dailyBias === 'strongly_bullish';
    const bearBias = hierarchical.dailyBias === 'bearish' || hierarchical.dailyBias === 'strongly_bearish';
    if ((bullBias && trend.direction === 'uptrend') || (bearBias && trend.direction === 'downtrend')) {
      score += 5;
      factors.push({ name: '階層分析がトレンド確認', contribution: 5, positive: true });
    }
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  let label: string;
  if (score >= 80) label = '非常に高い';
  else if (score >= 60) label = '高い';
  else if (score >= 40) label = '中程度';
  else if (score >= 20) label = '低い';
  else label = '非常に低い';

  return { score, label, factors };
}

/**
 * Aggregate divergences from all timeframes with weighting.
 */
function aggregateDivergences(details: TimeframeAnalysis[]): DivergenceAggregation {
  let bullishCount = 0;
  let bearishCount = 0;
  let weightedBullish = 0;
  let weightedBearish = 0;

  for (const d of details) {
    const w = TIMEFRAME_WEIGHT[d.timeframe];
    if (!d.divergences) continue;
    for (const div of d.divergences) {
      if (div.type === 'bullish' || div.type === 'hidden_bullish') {
        bullishCount++;
        weightedBullish += (div.type === 'bullish' ? 1.5 : 0.8) * w;
      } else {
        bearishCount++;
        weightedBearish += (div.type === 'bearish' ? 1.5 : 0.8) * w;
      }
    }
  }

  const diff = weightedBullish - weightedBearish;
  let netSignal: DivergenceAggregation['netSignal'];
  if (diff > 1) netSignal = 'bullish';
  else if (diff < -1) netSignal = 'bearish';
  else netSignal = 'neutral';

  const total = bullishCount + bearishCount;
  let strength: DivergenceAggregation['strength'];
  if (total >= 3 && Math.abs(diff) > 3) strength = 'strong';
  else if (total >= 2 && Math.abs(diff) > 1) strength = 'moderate';
  else strength = 'weak';

  const label = netSignal === 'bullish' ? '強気' : netSignal === 'bearish' ? '弱気' : '中立';
  const description = total > 0
    ? `${total}件検出 (強気${bullishCount}/弱気${bearishCount}), 加重スコア: ${label} (${strength})`
    : 'ダイバージェンスなし';

  return { bullishCount, bearishCount, weightedBullish, weightedBearish, netSignal, strength, description };
}

export interface MultiTimeframeInput {
  symbol: string;
  ticker: MarketData['ticker'];
  openInterest: MarketData['openInterest'];
  fundingRate: MarketData['fundingRate'];
  premiumIndex: MarketData['premiumIndex'];
  candlesByTimeframe: { timeframe: Timeframe; candles: OHLCV[]; takerBuyVolumes?: number[] }[];
  derivativesHistory?: DerivativesHistory;
  topTraderRatio?: TopTraderRatio;
  fearGreed?: FearGreedData;
}

export function generateSignal(input: MultiTimeframeInput): AnalysisResult {
  const { ticker, candlesByTimeframe } = input;
  const currentPrice = ticker.lastPrice;

  // Sort timeframes by weight (lowest first, so primary = last = highest)
  const sortedTf = [...candlesByTimeframe].sort(
    (a, b) => TIMEFRAME_WEIGHT[a.timeframe] - TIMEFRAME_WEIGHT[b.timeframe]
  );

  // Analyze each timeframe
  const details: TimeframeAnalysis[] = sortedTf.map((tf) =>
    analyzeTimeframe(tf.timeframe, tf.candles, currentPrice)
  );

  // Combine trend across timeframes
  const trend = combineTrends(details);

  // Merge S/R levels from all timeframes
  const levels = mergeLevels(details, currentPrice);

  // Derivatives (same across all timeframes)
  const derivativesData: MarketData = {
    symbol: input.symbol,
    timeframe: sortedTf[sortedTf.length - 1].timeframe,
    ticker: input.ticker,
    candles: sortedTf[sortedTf.length - 1].candles,
    openInterest: input.openInterest,
    fundingRate: input.fundingRate,
    premiumIndex: input.premiumIndex,
  };
  const derivatives = analyzeDerivatives(derivativesData, input.derivativesHistory);

  // Hierarchical analysis (daily → 4h → 1h → 15m)
  const hierarchical = buildHierarchicalAnalysis(details);

  // Trade setups from merged levels (ATR-based SL/TP)
  const primaryAtr = details[details.length - 1].indicators.atr;
  const nearestSupport = findNearestSupport(levels, currentPrice);
  const nearestResistance = findNearestResistance(levels, currentPrice);
  const longSetup = buildTradeSetup('long', currentPrice, nearestSupport, nearestResistance, primaryAtr);
  const shortSetup = buildTradeSetup('short', currentPrice, nearestSupport, nearestResistance, primaryAtr);

  // Breakout levels (enhanced with volume breakout info)
  const breakoutLevels: BreakoutLevel[] = [];
  const resistances = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);
  const supports = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);

  if (resistances.length > 0) {
    const volBreak = details.flatMap((d) => d.volumeBreakouts ?? []).find((vb) => vb.direction === 'bullish');
    breakoutLevels.push({
      price: resistances[0].price,
      direction: 'bullish_above',
      description: volBreak
        ? `${resistances[0].price} を上抜けで強気継続（出来高${volBreak.volumeRatio}倍で確認済み）`
        : `${resistances[0].price} を上抜けで強気継続`,
    });
  }
  if (supports.length > 0) {
    const volBreak = details.flatMap((d) => d.volumeBreakouts ?? []).find((vb) => vb.direction === 'bearish');
    breakoutLevels.push({
      price: supports[0].price,
      direction: 'bearish_below',
      description: volBreak
        ? `${supports[0].price} を割れで弱気転換（出来高${volBreak.volumeRatio}倍で確認済み）`
        : `${supports[0].price} を割れで弱気転換`,
    });
  }

  // Order flow from primary timeframe (computed early for scoring)
  const primaryTfEarly = sortedTf[sortedTf.length - 1];
  const orderFlowEarly = analyzeOrderFlow(primaryTfEarly.candles, primaryTfEarly.takerBuyVolumes);

  // Sentiment (computed early for scoring)
  const sentimentEarly = input.fearGreed ? analyzeSentiment(input.fearGreed) : undefined;

  // Conclusion
  const { conclusion, reason } = determineConclusion(
    trend,
    derivatives,
    details,
    longSetup,
    shortSetup,
    hierarchical,
    { imbalance: orderFlowEarly.imbalance },
    sentimentEarly?.signal,
  );

  // Previous day high/low from daily candles
  const dailyAnalysis = details.find((d) => d.timeframe === '1d');
  const prevDayHigh = dailyAnalysis?.prevDayHigh;
  const prevDayLow = dailyAnalysis?.prevDayLow;

  // Confidence scoring
  const confidence = calcConfidence(trend, details, derivatives, longSetup, shortSetup, hierarchical, input.topTraderRatio);

  // Use primary (highest weight) timeframe for top-level indicators/patterns
  const primary = details[details.length - 1];
  const recentHigh = Math.max(...details.map((d) => d.recentHigh));
  const recentLow = Math.min(...details.map((d) => d.recentLow));

  // Market regime classification (from primary timeframe)
  const marketRegime = classifyMarketRegime(
    sortedTf[sortedTf.length - 1].candles,
    primary.indicators,
    trend.direction,
  );

  // Volume profile (from primary timeframe candles)
  const volumeProfile = buildVolumeProfile(sortedTf[sortedTf.length - 1].candles);

  // Liquidation level estimation
  const liquidation = estimateLiquidationLevels(
    sortedTf[sortedTf.length - 1].candles,
    currentPrice,
  );

  // Reuse order flow and sentiment computed earlier for scoring
  const orderFlow = orderFlowEarly;

  // Divergence aggregation across all timeframes
  const divergenceAggregation = aggregateDivergences(details);

  // Reuse sentiment computed earlier
  const sentiment = sentimentEarly;

  return {
    marketSummary: {
      symbol: input.symbol,
      timeframes: sortedTf.map((t) => t.timeframe),
      currentPrice,
      priceChangePercent: ticker.priceChangePercent,
      volume24h: ticker.quoteVolume,
      openInterest: input.openInterest.openInterest,
      fundingRate: input.fundingRate.fundingRate,
      premium: derivatives.premium,
      recentHigh,
      recentLow,
      prevDayHigh,
      prevDayLow,
    },
    timeframeDetails: details,
    trend,
    levels,
    longSetup,
    shortSetup,
    breakoutLevels,
    conclusion,
    conclusionReason: reason,
    indicators: primary.indicators,
    patterns: primary.patterns,
    derivatives,
    hierarchical,
    confidence,
    topTraderRatio: input.topTraderRatio,
    marketRegime,
    volumeProfile,
    liquidation,
    orderFlow,
    divergenceAggregation,
    sentiment,
  };
}
