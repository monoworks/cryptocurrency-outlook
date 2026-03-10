import {
  MarketData,
  AnalysisResult,
  TradeSetup,
  BreakoutLevel,
  SignalConclusion,
  PriceLevel,
  TrendAnalysis,
  DerivativesAnalysis,
  IndicatorValues,
  CandlePattern,
} from './types';
import { calcIndicators } from './indicators';
import { detectPatterns } from './patterns';
import { analyzeTrend } from './trend';
import { detectSupportResistance } from './support-resistance';
import { analyzeDerivatives } from './derivatives';

function findNearestSupport(levels: PriceLevel[], currentPrice: number): number {
  const supports = levels
    .filter((l) => l.type === 'support')
    .sort((a, b) => b.price - a.price); // highest support first
  return supports.length > 0 ? supports[0].price : currentPrice * 0.97;
}

function findNearestResistance(levels: PriceLevel[], currentPrice: number): number {
  const resistances = levels
    .filter((l) => l.type === 'resistance')
    .sort((a, b) => a.price - b.price); // lowest resistance first
  return resistances.length > 0 ? resistances[0].price : currentPrice * 1.03;
}

function buildTradeSetup(
  direction: 'long' | 'short',
  currentPrice: number,
  nearestSupport: number,
  nearestResistance: number
): TradeSetup {
  if (direction === 'long') {
    const entry = currentPrice;
    const stopLoss = nearestSupport * 0.998; // slightly below support
    const target = nearestResistance;
    const risk = entry - stopLoss;
    const reward = target - entry;
    return {
      direction: 'long',
      entry,
      stopLoss: Math.round(stopLoss * 100) / 100,
      target: Math.round(target * 100) / 100,
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      riskPercent: Math.round(((entry - stopLoss) / entry) * 10000) / 100,
      rewardPercent: Math.round(((target - entry) / entry) * 10000) / 100,
    };
  } else {
    const entry = currentPrice;
    const stopLoss = nearestResistance * 1.002; // slightly above resistance
    const target = nearestSupport;
    const risk = stopLoss - entry;
    const reward = entry - target;
    return {
      direction: 'short',
      entry,
      stopLoss: Math.round(stopLoss * 100) / 100,
      target: Math.round(target * 100) / 100,
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      riskPercent: Math.round(((stopLoss - entry) / entry) * 10000) / 100,
      rewardPercent: Math.round(((entry - target) / entry) * 10000) / 100,
    };
  }
}

function determineConclusion(
  trend: TrendAnalysis,
  derivatives: DerivativesAnalysis,
  indicators: IndicatorValues,
  longSetup: TradeSetup,
  shortSetup: TradeSetup,
  patterns: CandlePattern[]
): { conclusion: SignalConclusion; reason: string } {
  let bullishScore = 0;
  let bearishScore = 0;

  // Trend
  if (trend.direction === 'uptrend') bullishScore += 2;
  if (trend.direction === 'downtrend') bearishScore += 2;

  // RSI
  if (indicators.rsi != null) {
    if (indicators.rsi < 30) bullishScore += 1; // oversold
    if (indicators.rsi > 70) bearishScore += 1; // overbought
    if (indicators.rsi > 50 && indicators.rsi < 70) bullishScore += 0.5;
    if (indicators.rsi < 50 && indicators.rsi > 30) bearishScore += 0.5;
  }

  // MACD
  if (indicators.macd) {
    if (indicators.macd.histogram > 0) bullishScore += 1;
    else bearishScore += 1;
  }

  // Derivatives
  if (derivatives.oiPriceSignal === 'new_longs') bullishScore += 1;
  if (derivatives.oiPriceSignal === 'new_shorts') bearishScore += 1;
  if (derivatives.oiPriceSignal === 'short_cover') bullishScore += 0.5;
  if (derivatives.oiPriceSignal === 'long_liquidation') bearishScore += 0.5;

  // Funding extreme = contrarian signal
  if (derivatives.fundingBias === 'long_heavy') bearishScore += 0.5;
  if (derivatives.fundingBias === 'short_heavy') bullishScore += 0.5;

  // Patterns
  for (const p of patterns) {
    if (p.signal === 'bullish') bullishScore += 0.5;
    if (p.signal === 'bearish') bearishScore += 0.5;
  }

  const diff = bullishScore - bearishScore;
  const bestRR = Math.max(longSetup.riskRewardRatio, shortSetup.riskRewardRatio);

  let conclusion: SignalConclusion;
  let reason: string;

  if (Math.abs(diff) < 1) {
    conclusion = 'skip';
    reason = `強気/弱気シグナルが拮抗 (強気${bullishScore.toFixed(1)} vs 弱気${bearishScore.toFixed(1)})。明確な方向性が出るまで見送り推奨。`;
  } else if (bestRR < 1.5) {
    conclusion = 'wait';
    reason = `方向性はあるが、現在のPR比(${bestRR})が低い。引きつけてからのエントリー推奨。`;
  } else if (diff >= 2) {
    conclusion = 'enter_long';
    reason = `強気シグナル優勢 (${bullishScore.toFixed(1)} vs ${bearishScore.toFixed(1)})。ロングのPR比${longSetup.riskRewardRatio}。`;
  } else if (diff <= -2) {
    conclusion = 'enter_short';
    reason = `弱気シグナル優勢 (弱気${bearishScore.toFixed(1)} vs 強気${bullishScore.toFixed(1)})。ショートのPR比${shortSetup.riskRewardRatio}。`;
  } else if (diff > 0) {
    conclusion = 'wait';
    reason = `やや強気だが確信度不十分 (${bullishScore.toFixed(1)} vs ${bearishScore.toFixed(1)})。押し目を待ってロング検討。`;
  } else {
    conclusion = 'wait';
    reason = `やや弱気だが確信度不十分 (弱気${bearishScore.toFixed(1)} vs 強気${bullishScore.toFixed(1)})。戻りを待ってショート検討。`;
  }

  return { conclusion, reason };
}

export function generateSignal(data: MarketData): AnalysisResult {
  const { candles, ticker } = data;
  const currentPrice = ticker.lastPrice;

  // Calculate all analyses
  const indicators = calcIndicators(candles);
  const patterns = detectPatterns(candles);
  const trend = analyzeTrend(candles, indicators);
  const levels = detectSupportResistance(candles, currentPrice);
  const derivatives = analyzeDerivatives(data);

  // Find key levels
  const nearestSupport = findNearestSupport(levels, currentPrice);
  const nearestResistance = findNearestResistance(levels, currentPrice);

  // Build trade setups
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
    indicators,
    longSetup,
    shortSetup,
    patterns
  );

  // Recent high/low
  const recent20 = candles.slice(-20);
  const recentHigh = Math.max(...recent20.map((c) => c.high));
  const recentLow = Math.min(...recent20.map((c) => c.low));

  return {
    marketSummary: {
      symbol: data.symbol,
      timeframe: data.timeframe,
      currentPrice,
      priceChangePercent: ticker.priceChangePercent,
      volume24h: ticker.quoteVolume,
      openInterest: data.openInterest.openInterest,
      fundingRate: data.fundingRate.fundingRate,
      premium: derivatives.premium,
      recentHigh,
      recentLow,
    },
    trend,
    levels,
    longSetup,
    shortSetup,
    breakoutLevels,
    conclusion,
    conclusionReason: reason,
    indicators,
    patterns,
    derivatives,
  };
}
