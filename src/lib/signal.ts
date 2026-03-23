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
  EconomicEvent,
  NewsArticle,
  NewsAnalysis,
  WhaleActivity,
  TradingStyle,
  TradingStyleConfig,
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
import { analyzeEconomicCalendar } from './economic-calendar';
import { analyzeNews } from './news';
import { analyzeCrowdPsychology, CrowdPsychologySignal } from './crowd-psychology';
import { TRADING_STYLE_CONFIGS } from './trading-style';

// Default weights (swing style) — used as fallback when no style config is passed
const DEFAULT_WEIGHTS: Record<Timeframe, number> = TRADING_STYLE_CONFIGS.swing.weights;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findNearestSupport(levels: PriceLevel[], currentPrice: number): number {
  const supports = levels
    .filter((l) => l.type === 'support' && l.price < currentPrice)
    .sort((a, b) => b.price - a.price); // highest first (closest below)
  return supports.length > 0 ? supports[0].price : currentPrice * 0.97;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findNearestResistance(levels: PriceLevel[], currentPrice: number): number {
  const resistances = levels
    .filter((l) => l.type === 'resistance' && l.price > currentPrice)
    .sort((a, b) => a.price - b.price); // lowest first (closest above)
  return resistances.length > 0 ? resistances[0].price : currentPrice * 1.03;
}

/**
 * 指値エントリー用のサポートを探す。
 * 現在値からの最低距離（minDistance）以上離れたサポートの中で、
 * 最も strength が高いものを返す。
 * なければ最も近いサポートにフォールバック。
 */
function findEntrySupport(
  levels: PriceLevel[],
  currentPrice: number,
  atr: number | null,
): number {
  const minDistance = atr ? atr * 0.3 : currentPrice * 0.005; // 最低 0.3×ATR 離す
  const maxDistance = atr ? atr * 2.0 : currentPrice * 0.03;  // 最大 2.0×ATR まで探索

  // 十分に引きつけたサポートを strength 順で探す
  const deepSupports = levels
    .filter((l) =>
      l.type === 'support' &&
      l.price < currentPrice - minDistance &&
      l.price > currentPrice - maxDistance
    )
    .sort((a, b) => b.strength - a.strength); // 最も強いものを優先

  if (deepSupports.length > 0) return deepSupports[0].price;

  // フォールバック: minDistance 以上離れた最も近いサポート
  const anySupportBeyondMin = levels
    .filter((l) => l.type === 'support' && l.price < currentPrice - minDistance)
    .sort((a, b) => b.price - a.price); // closest beyond min

  if (anySupportBeyondMin.length > 0) return anySupportBeyondMin[0].price;

  // 最終フォールバック: 最も近いサポート（現状と同じ動作）
  const nearest = levels
    .filter((l) => l.type === 'support' && l.price < currentPrice)
    .sort((a, b) => b.price - a.price);

  return nearest.length > 0 ? nearest[0].price : currentPrice * 0.97;
}

/**
 * 指値エントリー用のレジスタンスを探す。
 * 現在値からの最低距離（minDistance）以上離れたレジスタンスの中で、
 * 最も strength が高いものを返す。
 */
function findEntryResistance(
  levels: PriceLevel[],
  currentPrice: number,
  atr: number | null,
): number {
  const minDistance = atr ? atr * 0.3 : currentPrice * 0.005;
  const maxDistance = atr ? atr * 2.0 : currentPrice * 0.03;

  const deepResistances = levels
    .filter((l) =>
      l.type === 'resistance' &&
      l.price > currentPrice + minDistance &&
      l.price < currentPrice + maxDistance
    )
    .sort((a, b) => b.strength - a.strength);

  if (deepResistances.length > 0) return deepResistances[0].price;

  const anyResistanceBeyondMin = levels
    .filter((l) => l.type === 'resistance' && l.price > currentPrice + minDistance)
    .sort((a, b) => a.price - b.price);

  if (anyResistanceBeyondMin.length > 0) return anyResistanceBeyondMin[0].price;

  const nearest = levels
    .filter((l) => l.type === 'resistance' && l.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  return nearest.length > 0 ? nearest[0].price : currentPrice * 1.03;
}

/**
 * Find a wider target by looking past the nearest level.
 * If the nearest target is too close (< minDistance), try the next S/R level
 * or fall back to ATR-based target.
 */
function findTarget(
  levels: PriceLevel[],
  currentPrice: number,
  direction: 'long' | 'short',
  minDistance: number,
): number {
  if (direction === 'long') {
    const targets = levels
      .filter((l) => l.type === 'resistance' && l.price > currentPrice)
      .sort((a, b) => a.price - b.price);
    // Pick the first target that is at least minDistance away
    const viable = targets.find((t) => t.price - currentPrice >= minDistance);
    if (viable) return viable.price;
    return targets.length > 0 ? targets[targets.length - 1].price : currentPrice * 1.03;
  } else {
    const targets = levels
      .filter((l) => l.type === 'support' && l.price < currentPrice)
      .sort((a, b) => b.price - a.price);
    const viable = targets.find((t) => currentPrice - t.price >= minDistance);
    if (viable) return viable.price;
    return targets.length > 0 ? targets[targets.length - 1].price : currentPrice * 0.97;
  }
}

/**
 * Find structure-based stop-loss by looking for the next S/R level beyond entry.
 * For longs: find the strongest support below entry → SL just below that.
 * For shorts: find the strongest resistance above entry → SL just above that.
 * ATR is used as a guardrail (min 0.3×ATR, max 1.5×ATR).
 */
function findStructureSL(
  direction: 'long' | 'short',
  entry: number,
  atr: number | null,
  levels: PriceLevel[],
): number {
  const buffer = entry * 0.001; // 0.1% buffer beyond the level
  // 最低幅を ATR×0.5 に引き上げ、さらに絶対最低幅を設定
  const absoluteMinSl = entry * 0.007; // 0.7%（BTC $69,000 なら約 $483）
  const atrMin = atr ? Math.max(atr * 0.5, absoluteMinSl) : absoluteMinSl;
  const atrMax = atr ? Math.max(atr * 2.0, entry * 0.03) : entry * 0.03;

  if (direction === 'long') {
    // Look for support levels below entry (sorted by proximity, then strength)
    const supports = levels
      .filter((l) => l.type === 'support' && l.price < entry - atrMin * 0.3)
      .sort((a, b) => {
        // Prefer closer levels, but give bonus to stronger ones
        const distA = entry - a.price;
        const distB = entry - b.price;
        return (distA - a.strength * entry * 0.001) - (distB - b.strength * entry * 0.001);
      });

    if (supports.length > 0) {
      const slLevel = supports[0].price - buffer;
      const distance = entry - slLevel;
      // Clamp within ATR bounds
      if (distance < atrMin) return entry - atrMin;
      if (distance > atrMax) return entry - atrMax;
      return slLevel;
    }
    // Fallback: use ATR-based SL
    return entry - (atr ? atr * 0.7 : entry * 0.01);
  } else {
    // Look for resistance levels above entry
    const resistances = levels
      .filter((l) => l.type === 'resistance' && l.price > entry + atrMin * 0.3)
      .sort((a, b) => {
        const distA = a.price - entry;
        const distB = b.price - entry;
        return (distA - a.strength * entry * 0.001) - (distB - b.strength * entry * 0.001);
      });

    if (resistances.length > 0) {
      const slLevel = resistances[0].price + buffer;
      const distance = slLevel - entry;
      if (distance < atrMin) return entry + atrMin;
      if (distance > atrMax) return entry + atrMax;
      return slLevel;
    }
    return entry + (atr ? atr * 0.7 : entry * 0.01);
  }
}

/**
 * 価格を実用的な指値単位に丸める。
 * 価格帯に応じて丸め単位を変える（BTC=$10単位、ETH=$5単位など）。
 */
function roundToTradingPrice(price: number, direction: 'up' | 'down' | 'nearest' = 'nearest'): number {
  let unit: number;
  if (price >= 10000) unit = 10;        // BTC等: $10単位
  else if (price >= 1000) unit = 5;     // ETH等: $5単位
  else if (price >= 100) unit = 1;      // SOL等: $1単位
  else if (price >= 10) unit = 0.1;     // 中位アルト: $0.1単位
  else unit = 0.01;                     // 小型アルト: $0.01単位

  switch (direction) {
    case 'up':
      return Math.ceil(price / unit) * unit;
    case 'down':
      return Math.floor(price / unit) * unit;
    case 'nearest':
    default:
      return Math.round(price / unit) * unit;
  }
}

function buildTradeSetup(
  direction: 'long' | 'short',
  currentPrice: number,
  entry: number,
  target: number,
  atr: number | null,
  levels: PriceLevel[],
): TradeSetup {
  if (direction === 'long') {
    const stopLoss = findStructureSL('long', entry, atr, levels);
    const risk = entry - stopLoss;

    // Find target: prefer S/R levels that give RR >= 1.5
    let finalTarget = target;
    if (finalTarget - entry < risk * 1.5) {
      const widerTarget = findTarget(levels, entry, 'long', risk * 1.5);
      if (widerTarget > finalTarget) finalTarget = widerTarget;
    }
    // Fallback: if still too close (RR < 1.0), project at 1.5x risk
    if (finalTarget - entry < risk) {
      finalTarget = entry + risk * 1.5;
    }

    // 丸め処理: ユーザーに有利な方向に丸める
    const roundedEntry = roundToTradingPrice(entry, 'down');           // 安く買う
    const roundedSL = roundToTradingPrice(stopLoss, 'down');           // SLを広めに
    const roundedTarget = roundToTradingPrice(finalTarget, 'up');      // 利確を遠めに

    const roundedRisk = roundedEntry - roundedSL;
    const roundedReward = roundedTarget - roundedEntry;

    return {
      direction: 'long',
      entry: roundedEntry,
      stopLoss: roundedSL,
      target: roundedTarget,
      riskRewardRatio: roundedRisk > 0 ? Math.round((roundedReward / roundedRisk) * 100) / 100 : 0,
      riskPercent: Math.round(((roundedEntry - roundedSL) / roundedEntry) * 10000) / 100,
      rewardPercent: Math.round(((roundedTarget - roundedEntry) / roundedEntry) * 10000) / 100,
    };
  } else {
    const stopLoss = findStructureSL('short', entry, atr, levels);
    const risk = stopLoss - entry;

    let finalTarget = target;
    if (entry - finalTarget < risk * 1.5) {
      const widerTarget = findTarget(levels, entry, 'short', risk * 1.5);
      if (widerTarget < finalTarget) finalTarget = widerTarget;
    }
    if (entry - finalTarget < risk) {
      finalTarget = entry - risk * 1.5;
    }

    const roundedEntry = roundToTradingPrice(entry, 'up');             // 高く売る
    const roundedSL = roundToTradingPrice(stopLoss, 'up');             // SLを広めに
    const roundedTarget = roundToTradingPrice(finalTarget, 'down');    // 利確を遠めに

    const roundedRisk = roundedSL - roundedEntry;
    const roundedReward = roundedEntry - roundedTarget;

    return {
      direction: 'short',
      entry: roundedEntry,
      stopLoss: roundedSL,
      target: roundedTarget,
      riskRewardRatio: roundedRisk > 0 ? Math.round((roundedReward / roundedRisk) * 100) / 100 : 0,
      riskPercent: Math.round(((roundedSL - roundedEntry) / roundedEntry) * 10000) / 100,
      rewardPercent: Math.round(((roundedEntry - roundedTarget) / roundedEntry) * 10000) / 100,
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
  const trend = analyzeTrend(candles, indicators, timeframe);
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

  // Volume profile (VRVP) per timeframe
  const volumeProfile = buildVolumeProfile(candles);

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
    volumeProfile,
  };
}

function combineTrends(details: TimeframeAnalysis[], weights: Record<Timeframe, number> = DEFAULT_WEIGHTS): TrendAnalysis {
  let uptrendWeight = 0;
  let downtrendWeight = 0;
  let totalWeight = 0;
  let adxSum = 0;
  let adxWeightSum = 0;

  for (const d of details) {
    const w = weights[d.timeframe] || 0;
    if (w === 0) continue;
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

function mergeLevels(details: TimeframeAnalysis[], currentPrice: number, weights: Record<Timeframe, number> = DEFAULT_WEIGHTS): PriceLevel[] {
  const allLevels: PriceLevel[] = [];

  for (const d of details) {
    const tfWeight = weights[d.timeframe] || 1;
    for (const level of d.levels) {
      allLevels.push({
        ...level,
        // Boost strength by timeframe weight (higher TF = stronger level)
        strength: Math.min(5, Math.round(level.strength * (tfWeight / 2))),
      });
    }

    // Inject VRVP levels (POC, VAH, VAL) as volume-backed S/R
    if (d.volumeProfile && d.volumeProfile.poc > 0) {
      const vp = d.volumeProfile;
      const vpStrength = Math.min(5, Math.round(2 * (tfWeight / 2)));

      // POC acts as both support and resistance (price magnet)
      const pocType = vp.poc < currentPrice ? 'support' : 'resistance';
      allLevels.push({
        price: vp.poc,
        strength: vpStrength,
        type: pocType,
        touchCount: 1,
      });

      // VAH = resistance when price is below, support when price is above
      if (vp.valueAreaHigh < currentPrice) {
        allLevels.push({ price: vp.valueAreaHigh, strength: Math.max(1, vpStrength - 1), type: 'support', touchCount: 1 });
      } else {
        allLevels.push({ price: vp.valueAreaHigh, strength: Math.max(1, vpStrength - 1), type: 'resistance', touchCount: 1 });
      }

      // VAL = support when price is above, resistance when price is below
      if (vp.valueAreaLow > currentPrice) {
        allLevels.push({ price: vp.valueAreaLow, strength: Math.max(1, vpStrength - 1), type: 'resistance', touchCount: 1 });
      } else {
        allLevels.push({ price: vp.valueAreaLow, strength: Math.max(1, vpStrength - 1), type: 'support', touchCount: 1 });
      }
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

  // === 心理的節目ボーナス ===
  // 千ドル単位の丸い数字に近いレベルの強度をブースト
  const psychLevels = [1000, 5000, 10000]; // $1K, $5K, $10K 単位
  for (const level of clustered) {
    for (const unit of psychLevels) {
      const distToRound = Math.abs(level.price % unit);
      const proximity = Math.min(distToRound, unit - distToRound);
      // 丸い数字から 0.3% 以内なら強度ボーナス
      if (proximity < level.price * 0.003) {
        const bonus = unit >= 10000 ? 2 : unit >= 5000 ? 1.5 : 1;
        level.strength = Math.min(5, level.strength + bonus);
        break; // 最大の単位でマッチしたらそれ以上チェックしない
      }
    }
  }

  return clustered.sort((a, b) => b.strength - a.strength).slice(0, 15);
}

/**
 * Hierarchical analysis: Environment → Setup → Trigger → Execution
 * Determines market bias from top-down perspective.
 * Uses role-based timeframe mapping from TradingStyleConfig.
 */
function buildHierarchicalAnalysis(
  details: TimeframeAnalysis[],
  roles?: TradingStyleConfig['roles'],
): HierarchicalAnalysis | undefined {
  const byTf = new Map(details.map((d) => [d.timeframe, d]));

  // Use role-based mapping if provided, otherwise fall back to swing defaults
  const envTfKey = roles?.environment ?? '1d';
  const setupTfKey = roles?.setup ?? '4h';
  const triggerTfKey = roles?.trigger ?? '1h';
  const execTfKey = roles?.execution ?? '15m';

  const envTf = byTf.get(envTfKey);
  const setupTf = byTf.get(setupTfKey);
  const triggerTf = byTf.get(triggerTfKey);
  const execTf = byTf.get(execTfKey);

  if (!envTf) return undefined; // 環境認識足がなければ階層分析不可

  // Step 1: Environment timeframe bias
  let dailyBias: MarketBias = 'neutral';
  const eTrend = envTf.trend;
  if (eTrend.direction === 'uptrend' && eTrend.strength === 'strong') dailyBias = 'strongly_bullish';
  else if (eTrend.direction === 'uptrend') dailyBias = 'bullish';
  else if (eTrend.direction === 'downtrend' && eTrend.strength === 'strong') dailyBias = 'strongly_bearish';
  else if (eTrend.direction === 'downtrend') dailyBias = 'bearish';

  // Step 2: Setup timeframe wave position
  let h4WavePosition = '不明';
  if (setupTf) {
    const sTrend = setupTf.trend;
    if (sTrend.higherHighs && sTrend.higherLows) {
      h4WavePosition = '高値安値切り上げ中（上昇波継続）';
    } else if (!sTrend.higherHighs && !sTrend.higherLows) {
      h4WavePosition = '高値安値切り下げ中（下落波継続）';
    } else if (setupTf.pullback) {
      h4WavePosition = `${setupTf.pullback.description}`;
    } else {
      h4WavePosition = sTrend.direction === 'range' ? 'レンジ内推移' : '方向転換の可能性';
    }
  }

  // Step 3: Trigger timeframe strategy
  let h1Strategy = '様子見';
  if (triggerTf) {
    const bullish = dailyBias === 'bullish' || dailyBias === 'strongly_bullish';
    const bearish = dailyBias === 'bearish' || dailyBias === 'strongly_bearish';

    if (bullish && triggerTf.pullback && triggerTf.pullback.depth !== 'deep') {
      h1Strategy = '押し目買い待ち';
    } else if (bullish && triggerTf.trend.direction === 'uptrend') {
      h1Strategy = '上昇トレンド継続 — ブレイクアウト or 押し目買い';
    } else if (bearish && triggerTf.pullback && triggerTf.pullback.depth !== 'deep') {
      h1Strategy = '戻り売り待ち';
    } else if (bearish && triggerTf.trend.direction === 'downtrend') {
      h1Strategy = '下落トレンド継続 — 戻り売り';
    } else if (dailyBias === 'neutral') {
      h1Strategy = 'レンジ戦略 — 上限売り/下限買い';
    } else {
      h1Strategy = '方向性と短期足が不一致 — 様子見推奨';
    }
  }

  // Step 4: Execution timeframe entry summary
  let entryTimeframe = `${execTfKey}足で指値位置を確定`;
  if (execTf && execTf.pullback?.retestDetected) {
    entryTimeframe = `${execTfKey}足リテスト確認済み — $${execTf.pullback.retestLevel?.toLocaleString()} 付近`;
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
    `${envTfKey}: ${biasLabels[dailyBias]}`,
    `${setupTfKey}: ${h4WavePosition}`,
    `${triggerTfKey}戦略: ${h1Strategy}`,
    entryTimeframe,
  ].join(' → ');

  return { dailyBias, h4WavePosition, h1Strategy, entryTimeframe, description, environmentLabel: envTfKey };
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
  economicWarning?: 'none' | 'caution' | 'danger',
  economicDescription?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _newsAnalysis?: NewsAnalysis,
  crowdPsychology?: CrowdPsychologySignal,
  weights: Record<Timeframe, number> = DEFAULT_WEIGHTS,
): { conclusion: SignalConclusion; reason: string } {
  let bullishScore = 0;
  let bearishScore = 0;
  let totalWeight = 0;

  // Per-timeframe weighted scoring
  for (const d of details) {
    const w = weights[d.timeframe] || 0;
    if (w === 0) continue;
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

    // VRVP: price position relative to Value Area
    if (d.volumeProfile) {
      const vp = d.volumeProfile;
      if (vp.currentPriceVsVA === 'above') {
        // Price above VA: bullish momentum (continuation) but overextension risk
        bullishScore += 0.3 * w;
      } else if (vp.currentPriceVsVA === 'below') {
        // Price below VA: bearish momentum but potential mean reversion
        bearishScore += 0.3 * w;
      }
      // Price near POC in ranging market suggests consolidation (no directional bias)
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

  // 群集心理の調整（逆張りシグナル）
  if (crowdPsychology) {
    bullishScore += Math.max(0, crowdPsychology.biasAdjustment);
    bearishScore += Math.max(0, -crowdPsychology.biasAdjustment);
  }

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

  // Economic calendar override
  if (economicWarning === 'danger') {
    if (conclusion === 'enter_long' || conclusion === 'enter_short') {
      conclusion = 'wait';
    }
    reason += ` ⚠ ${economicDescription ?? '重要経済指標発表間近'} — イベント通過まで様子見推奨。`;
  } else if (economicWarning === 'caution' && economicDescription) {
    reason += ` [${economicDescription}]`;
  }

  // === 階層フィルター: 上位足バイアスに逆行するエントリーを抑止 ===
  if (hierarchical) {
    const { dailyBias } = hierarchical;
    const envLabel = hierarchical.environmentLabel ?? '日足';

    // 環境認識足が弱気なのにロングシグナル → wait に降格
    if (
      (dailyBias === 'strongly_bearish' || dailyBias === 'bearish') &&
      conclusion === 'enter_long'
    ) {
      conclusion = 'wait';
      reason += ` [階層フィルター] ${envLabel}バイアスが弱気のためロング見送り。押し目の深さを再評価してからエントリーを検討。`;
    }

    // 環境認識足が強気なのにショートシグナル → wait に降格
    if (
      (dailyBias === 'strongly_bullish' || dailyBias === 'bullish') &&
      conclusion === 'enter_short'
    ) {
      conclusion = 'wait';
      reason += ` [階層フィルター] ${envLabel}バイアスが強気のためショート見送り。戻り高値を再評価してからエントリーを検討。`;
    }
  }

  return { conclusion, reason };
}

/**
 * Adjust the technical conclusion by incorporating news sentiment.
 * This is experimental — the technical conclusion remains the primary signal.
 */
export function determineNewsAdjustedConclusion(
  techConclusion: SignalConclusion,
  techReason: string,
  newsAnalysis?: NewsAnalysis,
): { conclusion: SignalConclusion; reason: string } | undefined {
  if (!newsAnalysis || newsAnalysis.articles.length === 0) return undefined;

  const { sentimentScore, netSentiment, highImpactCount, description } = newsAnalysis;

  let conclusion = techConclusion;
  const parts: string[] = [];

  // Strong news sentiment can shift the conclusion
  if (Math.abs(sentimentScore) >= 0.5 && highImpactCount > 0) {
    // News strongly disagrees with technical signal
    if (sentimentScore <= -0.5 && techConclusion === 'enter_long') {
      conclusion = 'wait';
      parts.push('テクニカルは強気だがリスクオフニュースが優勢のため様子見に変更。');
    } else if (sentimentScore >= 0.5 && techConclusion === 'enter_short') {
      conclusion = 'wait';
      parts.push('テクニカルは弱気だがリスクオンニュースが優勢のため様子見に変更。');
    }
    // News reinforces technical signal
    else if (sentimentScore >= 0.5 && techConclusion === 'enter_long') {
      parts.push('リスクオンニュースがロングシグナルを後押し。');
    } else if (sentimentScore <= -0.5 && techConclusion === 'enter_short') {
      parts.push('リスクオフニュースがショートシグナルを後押し。');
    }
    // News could tip a wait towards action
    else if (techConclusion === 'wait') {
      if (sentimentScore >= 0.5) {
        parts.push('リスクオンニュースが後押し — テクニカルの押し目待ちと併せてロング方向優位。');
      } else if (sentimentScore <= -0.5) {
        parts.push('リスクオフニュースが後押し — テクニカルの戻り待ちと併せてショート方向優位。');
      }
    }
  }

  // Moderate news sentiment — just add context
  if (parts.length === 0) {
    if (netSentiment === 'risk_off') {
      parts.push('ニュースはやや弱気寄り。');
    } else if (netSentiment === 'risk_on') {
      parts.push('ニュースはやや強気寄り。');
    } else {
      parts.push('ニュースに目立った偏りなし。');
    }
  }

  parts.push(description);

  // Build reason: start with the technical reason, then add news context
  const reason = `${techReason} [ニュース: ${parts.join(' ')}]`;

  return { conclusion, reason };
}

/**
 * Adjust the technical conclusion by incorporating whale activity.
 * This is experimental — the technical conclusion remains the primary signal.
 */
export function determineWhaleAdjustedConclusion(
  techConclusion: SignalConclusion,
  techReason: string,
  whaleActivity?: WhaleActivity,
): { conclusion: SignalConclusion; reason: string } | undefined {
  if (!whaleActivity || whaleActivity.largeTradeCount === 0) return undefined;

  let conclusion = techConclusion;
  const parts: string[] = [];

  const { signal, buyVolume, sellVolume } = whaleActivity;

  // Strong whale signal can shift the conclusion
  if (signal === 'accumulation' && techConclusion === 'enter_short') {
    conclusion = 'wait';
    parts.push('テクニカルは弱気だが大口が買い集め中のため様子見に変更。');
  } else if (signal === 'distribution' && techConclusion === 'enter_long') {
    conclusion = 'wait';
    parts.push('テクニカルは強気だが大口が売り抜け中のため様子見に変更。');
  }
  // Whale reinforces technical signal
  else if (signal === 'accumulation' && techConclusion === 'enter_long') {
    parts.push('大口の買い集めがロングシグナルを後押し。');
  } else if (signal === 'distribution' && techConclusion === 'enter_short') {
    parts.push('大口の売り抜けがショートシグナルを後押し。');
  }
  // Whale could tip a wait
  else if (techConclusion === 'wait') {
    if (signal === 'accumulation') {
      parts.push('大口が買い集め中 — ロング方向優位の可能性。');
    } else if (signal === 'distribution') {
      parts.push('大口が売り抜け中 — ショート方向優位の可能性。');
    }
  }

  // Neutral whale or no strong shift — just add context
  if (parts.length === 0) {
    if (signal === 'accumulation') {
      parts.push('大口はやや買い優勢。');
    } else if (signal === 'distribution') {
      parts.push('大口はやや売り優勢。');
    } else {
      parts.push('大口の売買に偏りなし。');
    }
  }

  const volLabel = `買$${fmtUsd(buyVolume)}/売$${fmtUsd(sellVolume)}`;
  parts.push(`大口${whaleActivity.largeTradeCount}件 (${volLabel})`);

  const reason = `${techReason} [大口動向: ${parts.join(' ')}]`;
  return { conclusion, reason };
}

function fmtUsd(usd: number): string {
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `${(usd / 1_000).toFixed(0)}K`;
  return usd.toFixed(0);
}

function calcConfidence(
  trend: TrendAnalysis,
  details: TimeframeAnalysis[],
  derivatives: DerivativesAnalysis,
  longSetup: TradeSetup,
  shortSetup: TradeSetup,
  hierarchical?: HierarchicalAnalysis,
  topTraderRatio?: TopTraderRatio,
  economicConfidenceImpact?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _newsAnalysis?: NewsAnalysis,
  orderFlowData?: { imbalance: number },
  whaleActivity?: WhaleActivity,
  expectedTimeframes?: Timeframe[],
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

  // 7. VRVP multi-timeframe consistency (+5 if majority agree on VA position)
  const vpPositions = details.map((d) => d.volumeProfile?.currentPriceVsVA).filter(Boolean);
  if (vpPositions.length >= 2) {
    const aboveCount = vpPositions.filter((p) => p === 'above').length;
    const belowCount = vpPositions.filter((p) => p === 'below').length;
    const majorityThreshold = vpPositions.length / 2;
    if (aboveCount > majorityThreshold || belowCount > majorityThreshold) {
      score += 5;
      factors.push({ name: 'VRVP方向一致', contribution: 5, positive: true });
    }
  }

  // 8. Hierarchical alignment (+5)
  if (hierarchical) {
    const bullBias = hierarchical.dailyBias === 'bullish' || hierarchical.dailyBias === 'strongly_bullish';
    const bearBias = hierarchical.dailyBias === 'bearish' || hierarchical.dailyBias === 'strongly_bearish';
    if ((bullBias && trend.direction === 'uptrend') || (bearBias && trend.direction === 'downtrend')) {
      score += 5;
      factors.push({ name: '階層分析がトレンド確認', contribution: 5, positive: true });
    }
  }

  // 9. Economic calendar impact
  if (economicConfidenceImpact && economicConfidenceImpact < 0) {
    score += economicConfidenceImpact;
    factors.push({ name: '経済指標発表リスク', contribution: Math.abs(economicConfidenceImpact), positive: false });
  }

  // Note: News is displayed separately — not factored into confidence scoring
  // Note: Whale activity is displayed separately — not factored into confidence scoring

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  let label: string;
  if (score >= 80) label = '非常に高い';
  else if (score >= 60) label = '高い';
  else if (score >= 40) label = '中程度';
  else if (score >= 20) label = '低い';
  else label = '非常に低い';

  // === 不足データの明示 ===
  const missingData: string[] = [];

  // チェック: 全タイムフレームが揃っているか
  if (expectedTimeframes && expectedTimeframes.length > 0) {
    const actualTfs = details.map(d => d.timeframe);
    const missingTfs = expectedTimeframes.filter(tf => !actualTfs.includes(tf));
    if (missingTfs.length > 0) {
      missingData.push(`${missingTfs.join('/')}足のデータ未取得`);
    }
  }

  // チェック: デリバティブ履歴
  if (!derivatives.oiChange) {
    missingData.push('OI履歴データなし（変化方向の判定が不完全）');
  }

  // チェック: オーダーフロー（Taker買い出来高）
  if (!orderFlowData || orderFlowData.imbalance === 0) {
    missingData.push('Taker売買比率データなし');
  }

  // チェック: ホエール検出
  if (!whaleActivity || whaleActivity.largeTradeCount === 0) {
    missingData.push('大口取引データなし');
  }

  return { score, label, factors, missingData: missingData.length > 0 ? missingData : undefined };
}

/**
 * Aggregate divergences from all timeframes with weighting.
 */
function aggregateDivergences(details: TimeframeAnalysis[], weights: Record<Timeframe, number> = DEFAULT_WEIGHTS): DivergenceAggregation {
  let bullishCount = 0;
  let bearishCount = 0;
  let weightedBullish = 0;
  let weightedBearish = 0;

  for (const d of details) {
    const w = weights[d.timeframe] || 0;
    if (w === 0) continue;
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
  economicEvents?: EconomicEvent[];
  newsArticles?: NewsArticle[] | null;
  whaleActivity?: WhaleActivity;
  tradingStyle?: TradingStyle;
}

export function generateSignal(input: MultiTimeframeInput): AnalysisResult {
  const { ticker, candlesByTimeframe } = input;
  const currentPrice = ticker.lastPrice;

  // Resolve trading style config
  const styleConfig = TRADING_STYLE_CONFIGS[input.tradingStyle ?? 'swing'];
  const weights = styleConfig.weights;

  // Sort timeframes by weight (lowest first, so primary = last = highest)
  const sortedTf = [...candlesByTimeframe].sort(
    (a, b) => (weights[a.timeframe] || 0) - (weights[b.timeframe] || 0)
  );

  // Analyze each timeframe
  const details: TimeframeAnalysis[] = sortedTf.map((tf) =>
    analyzeTimeframe(tf.timeframe, tf.candles, currentPrice)
  );

  // Combine trend across timeframes
  const trend = combineTrends(details, weights);

  // Merge S/R levels from all timeframes
  const levels = mergeLevels(details, currentPrice, weights);

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

  // Hierarchical analysis using role-based timeframes
  const hierarchical = buildHierarchicalAnalysis(details, styleConfig.roles);

  // Crowd psychology analysis
  const crowdPsychology = analyzeCrowdPsychology(
    derivatives,
    input.fearGreed?.value,
  );

  // blendedAtr: セットアップ足のATRを基準に、トリガー足で補正
  // セットアップ足（エントリー判断の時間足）のボラティリティがSLの基準になるべき
  let blendedAtr: number | null = null;
  {
    const setupTf = styleConfig.roles.setup;
    const triggerTf = styleConfig.roles.trigger;

    const setupDetail = details.find(d => d.timeframe === setupTf);
    const triggerDetail = details.find(d => d.timeframe === triggerTf);

    const setupAtr = setupDetail?.indicators.atr ?? null;
    const triggerAtr = triggerDetail?.indicators.atr ?? null;

    if (setupAtr != null && triggerAtr != null) {
      // セットアップ足 70%、トリガー足 30% のブレンド
      blendedAtr = setupAtr * 0.7 + triggerAtr * 0.3;
    } else if (setupAtr != null) {
      blendedAtr = setupAtr;
    } else if (triggerAtr != null) {
      blendedAtr = triggerAtr;
    }
  }

  // Trade setups from merged levels
  const minTargetDistance = blendedAtr ? blendedAtr * 0.5 : currentPrice * 0.005;
  const longEntry = findEntrySupport(levels, currentPrice, blendedAtr);
  const longTarget = findTarget(levels, longEntry, 'long', minTargetDistance);
  const shortEntry = findEntryResistance(levels, currentPrice, blendedAtr);
  const shortTarget = findTarget(levels, shortEntry, 'short', minTargetDistance);
  const longSetup = buildTradeSetup('long', currentPrice, longEntry, longTarget, blendedAtr, levels);
  const shortSetup = buildTradeSetup('short', currentPrice, shortEntry, shortTarget, blendedAtr, levels);

  // Use the trading style's max holding time
  {
    longSetup.suggestedMaxHoldingMs = styleConfig.maxHoldingMs;
    shortSetup.suggestedMaxHoldingMs = styleConfig.maxHoldingMs;
    longSetup.tradingStyle = styleConfig.style;
    shortSetup.tradingStyle = styleConfig.style;
  }

  // OI残存率によるSL調整: ボラティリティ予測が高い場合はSLを広げる
  if (derivatives.oiResidual?.volatilityBias === 'high' && blendedAtr) {
    const slMultiplier = 1.2; // SLをATRの1.2倍に拡大
    const longSlDistance = longSetup.entry - longSetup.stopLoss;
    const minSlDistance = blendedAtr * 0.5 * slMultiplier;
    if (longSlDistance < minSlDistance) {
      longSetup.stopLoss = Math.round((longSetup.entry - minSlDistance) * 100) / 100;
      longSetup.riskPercent = Math.round(((longSetup.entry - longSetup.stopLoss) / longSetup.entry) * 10000) / 100;
      const risk = longSetup.entry - longSetup.stopLoss;
      const reward = longSetup.target - longSetup.entry;
      longSetup.riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
    }
    const shortSlDistance = shortSetup.stopLoss - shortSetup.entry;
    if (shortSlDistance < minSlDistance) {
      shortSetup.stopLoss = Math.round((shortSetup.entry + minSlDistance) * 100) / 100;
      shortSetup.riskPercent = Math.round(((shortSetup.stopLoss - shortSetup.entry) / shortSetup.entry) * 10000) / 100;
      const risk = shortSetup.stopLoss - shortSetup.entry;
      const reward = shortSetup.entry - shortSetup.target;
      shortSetup.riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
    }
  }

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

  // Economic calendar (computed early for scoring + conclusion override)
  const economicCalendar = analyzeEconomicCalendar(input.economicEvents ?? null);

  // News analysis (computed early for scoring)
  const newsAnalysisResult = analyzeNews(input.newsArticles ?? null);

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
    economicCalendar.warningLevel,
    economicCalendar.description,
    newsAnalysisResult,
    crowdPsychology,
    weights,
  );

  // News-adjusted conclusion (experimental)
  // If analyzeNews returned undefined but raw articles exist, create a minimal fallback
  const newsForConclusion = newsAnalysisResult ?? (
    input.newsArticles && input.newsArticles.length > 0
      ? { articles: input.newsArticles, highImpactCount: 0, netSentiment: 'neutral' as const, sentimentScore: 0, description: `ニュース${input.newsArticles.length}件取得（暗号資産への直接的な影響は限定的）` }
      : undefined
  );
  const newsAdjusted = determineNewsAdjustedConclusion(conclusion, reason, newsForConclusion);

  // Whale activity is kept as reference data only — no longer adjusts the conclusion

  // Previous day high/low from daily candles
  const dailyAnalysis = details.find((d) => d.timeframe === '1d');
  const prevDayHigh = dailyAnalysis?.prevDayHigh;
  const prevDayLow = dailyAnalysis?.prevDayLow;

  // Confidence scoring
  const confidence = calcConfidence(trend, details, derivatives, longSetup, shortSetup, hierarchical, input.topTraderRatio, economicCalendar.confidenceImpact, newsAnalysisResult, { imbalance: orderFlowEarly.imbalance }, input.whaleActivity, styleConfig.timeframes);

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

  // Volume profile (from primary timeframe candles — kept for backward compat)
  const volumeProfile = buildVolumeProfile(sortedTf[sortedTf.length - 1].candles);

  // Per-timeframe volume profiles (VRVP)
  const timeframeVolumeProfiles = details
    .filter((d) => d.volumeProfile != null)
    .map((d) => ({ timeframe: d.timeframe, profile: d.volumeProfile! }));

  // Liquidation level estimation
  const liquidation = estimateLiquidationLevels(
    sortedTf[sortedTf.length - 1].candles,
    currentPrice,
  );

  // Reuse order flow and sentiment computed earlier for scoring
  const orderFlow = orderFlowEarly;

  // Divergence aggregation across all timeframes
  const divergenceAggregation = aggregateDivergences(details, weights);

  // Reuse sentiment computed earlier
  const sentiment = sentimentEarly;

  return {
    tradingStyle: input.tradingStyle ?? 'swing',
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
    newsAdjustedConclusion: newsAdjusted?.conclusion,
    newsAdjustedReason: newsAdjusted?.reason,
    indicators: primary.indicators,
    patterns: primary.patterns,
    derivatives,
    hierarchical,
    confidence,
    topTraderRatio: input.topTraderRatio,
    marketRegime,
    volumeProfile,
    timeframeVolumeProfiles,
    liquidation,
    orderFlow,
    divergenceAggregation,
    sentiment,
    economicCalendar,
    newsAnalysis: newsAnalysisResult,
    whaleActivity: input.whaleActivity,
    crowdPsychology,
  };
}
