import {
  MarketData,
  AnalysisResult,
  TradeSetup,
  BreakoutLevel,
  SignalConclusion,
  PriceLevel,
  TrendAnalysis,
  TrendDirection,
  TrendStrength,
  DerivativesAnalysis,
  Timeframe,
  TimeframeAnalysis,
  OHLCV,
} from './types';
import { calcIndicators } from './indicators';
import { detectPatterns } from './patterns';
import { analyzeTrend } from './trend';
import { detectSupportResistance } from './support-resistance';
import { analyzeDerivatives } from './derivatives';

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
  nearestResistance: number
): TradeSetup {
  if (direction === 'long') {
    // 押し目買い: サポート付近で指値エントリー
    const entry = nearestSupport;
    const stopLoss = nearestSupport * 0.998;
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
    // 戻り売り: レジスタンス付近で指値エントリー
    const entry = nearestResistance;
    const stopLoss = nearestResistance * 1.002;
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

  return { timeframe, trend, indicators, patterns, levels, recentHigh, recentLow };
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

function determineConclusion(
  trend: TrendAnalysis,
  derivatives: DerivativesAnalysis,
  details: TimeframeAnalysis[],
  longSetup: TradeSetup,
  shortSetup: TradeSetup
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

  return { conclusion, reason };
}

export interface MultiTimeframeInput {
  symbol: string;
  ticker: MarketData['ticker'];
  openInterest: MarketData['openInterest'];
  fundingRate: MarketData['fundingRate'];
  premiumIndex: MarketData['premiumIndex'];
  candlesByTimeframe: { timeframe: Timeframe; candles: OHLCV[] }[];
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
  const derivatives = analyzeDerivatives(derivativesData);

  // Trade setups from merged levels
  const nearestSupport = findNearestSupport(levels, currentPrice);
  const nearestResistance = findNearestResistance(levels, currentPrice);
  const longSetup = buildTradeSetup('long', currentPrice, nearestSupport, nearestResistance);
  const shortSetup = buildTradeSetup('short', currentPrice, nearestSupport, nearestResistance);

  // Breakout levels
  const breakoutLevels: BreakoutLevel[] = [];
  const resistances = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);
  const supports = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);

  if (resistances.length > 0) {
    breakoutLevels.push({
      price: resistances[0].price,
      direction: 'bullish_above',
      description: `${resistances[0].price} を上抜けで強気継続`,
    });
  }
  if (supports.length > 0) {
    breakoutLevels.push({
      price: supports[0].price,
      direction: 'bearish_below',
      description: `${supports[0].price} を割れで弱気転換`,
    });
  }

  // Conclusion
  const { conclusion, reason } = determineConclusion(
    trend,
    derivatives,
    details,
    longSetup,
    shortSetup
  );

  // Use primary (highest weight) timeframe for top-level indicators/patterns
  const primary = details[details.length - 1];
  const recentHigh = Math.max(...details.map((d) => d.recentHigh));
  const recentLow = Math.min(...details.map((d) => d.recentLow));

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
  };
}
