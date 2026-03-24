import { OHLCV, IndicatorValues, TrendAnalysis, TrendDirection, TrendStrength, TrendDebugInfo, PullbackAnalysis, PriceLevel, Timeframe } from './types';

// タイムフレームごとのスイングハイ/ロー検出パラメータ
const SWING_LOOKBACK: Record<Timeframe, number> = {
  '5m': 5,    // 5本 = 25分
  '15m': 5,   // 5本 = 75分
  '1h': 8,    // 8本 = 8時間
  '4h': 10,   // 10本 = 40時間（約2日）
  '1d': 10,   // 10本 = 10日
};

// レンジ幅ベースのトレンド補助判定で使うルックバック本数
// SWING_LOOKBACK * 3 では不十分な場合があるため、独立した設定を使う
// 4H足では少なくとも10日分（60本）を見て大局的なレンジを捕捉する
const RANGE_LOOKBACK: Record<Timeframe, number> = {
  '5m': 48,   // 48本 = 4時間
  '15m': 32,  // 32本 = 8時間
  '1h': 48,   // 48本 = 2日
  '4h': 60,   // 60本 = 10日 ← 78K→67.8Kなど1週間超の下降トレンドを捕捉
  '1d': 30,   // 30本 = 1ヶ月
};

// スイングハイ/ローの最小振幅フィルタ（タイムフレーム別）
// この閾値未満の値動きはスイングと見なさない
const MIN_SWING_AMPLITUDE: Record<Timeframe, number> = {
  '5m': 0.003,   // 0.3%
  '15m': 0.005,  // 0.5%
  '1h': 0.01,    // 1.0%
  '4h': 0.02,    // 2.0% ← 4Hでは2%未満の動きはスイングと見なさない
  '1d': 0.03,    // 3.0%
};

/**
 * レンジ幅に応じたダイナミック閾値を算出。
 * レンジ幅が大きいほど、中間寄りでもトレンド方向にいると判断する。
 *   rangePercent=5%  → 0.35（狭いレンジ: 端にいる時のみ）
 *   rangePercent=10% → 0.40
 *   rangePercent=15% → 0.45（広いレンジ: 中間寄りでも方向性あり）
 *   rangePercent≥20% → 0.45（上限キャップ）
 * 返り値は下側閾値。上側は (1 - threshold) で対称に使う。
 */
function calcDynamicThreshold(rangePercent: number): number {
  const minThreshold = 0.35;  // rangePercent=5%時
  const maxThreshold = 0.45;  // rangePercent=15%+時
  const minRange = 5;
  const maxRange = 15;
  const clamped = Math.min(Math.max(rangePercent, minRange), maxRange);
  return minThreshold + (maxThreshold - minThreshold) * ((clamped - minRange) / (maxRange - minRange));
}

function detectSwings(candles: OHLCV[], lookback: number = 5, timeframe?: Timeframe): { highs: number[]; lows: number[] } {
  const minAmplitude = timeframe ? (MIN_SWING_AMPLITUDE[timeframe] ?? 0.01) : 0;
  const rawHighs: number[] = [];
  const rawLows: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) rawHighs.push(candles[i].high);
    if (isLow) rawLows.push(candles[i].low);
  }

  // 振幅フィルタ: 前回のスイングからの振幅が閾値未満ならスキップ
  const swingHighs: number[] = [];
  for (const h of rawHighs) {
    if (swingHighs.length === 0 || Math.abs(h - swingHighs[swingHighs.length - 1]) / swingHighs[swingHighs.length - 1] >= minAmplitude) {
      swingHighs.push(h);
    }
  }
  const swingLows: number[] = [];
  for (const l of rawLows) {
    if (swingLows.length === 0 || Math.abs(l - swingLows[swingLows.length - 1]) / swingLows[swingLows.length - 1] >= minAmplitude) {
      swingLows.push(l);
    }
  }

  return { highs: swingHighs, lows: swingLows };
}

export function analyzeTrend(
  candles: OHLCV[],
  indicators: IndicatorValues,
  timeframe?: Timeframe,
): TrendAnalysis {
  const { ema20, ema50, sma200, adx } = indicators;

  // MA alignment
  let maAlignment = '';
  let maScore = 0;
  if (ema20 != null && ema50 != null) {
    if (ema20 > ema50) {
      maScore += 1;
      maAlignment = 'EMA20 > EMA50';
    } else {
      maScore -= 1;
      maAlignment = 'EMA20 < EMA50';
    }
  }
  if (ema50 != null && sma200 != null) {
    if (ema50 > sma200) {
      maScore += 1;
      maAlignment += ' > SMA200';
    } else {
      maScore -= 1;
      maAlignment += ' < SMA200';
    }
  }

  // Swing high/low analysis (lookback adjusted by timeframe)
  const swingLookback = timeframe ? SWING_LOOKBACK[timeframe] : 5;
  const swings = detectSwings(candles, swingLookback, timeframe);
  const recentHighs = swings.highs.slice(-3);
  const recentLows = swings.lows.slice(-3);

  let higherHighs = false;
  let higherLows = false;
  if (recentHighs.length >= 2) {
    higherHighs = recentHighs[recentHighs.length - 1] > recentHighs[recentHighs.length - 2];
  }
  if (recentLows.length >= 2) {
    higherLows = recentLows[recentLows.length - 1] > recentLows[recentLows.length - 2];
  }

  const lowerHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1] < recentHighs[recentHighs.length - 2];
  const lowerLows = recentLows.length >= 2 && recentLows[recentLows.length - 1] < recentLows[recentLows.length - 2];

  // Direction from HH/HL and MA
  let direction: TrendDirection = 'range';
  if ((higherHighs && higherLows) || maScore >= 2) {
    direction = 'uptrend';
  } else if ((lowerHighs && lowerLows) || maScore <= -2) {
    direction = 'downtrend';
  } else if (maScore > 0 && (higherHighs || higherLows)) {
    direction = 'uptrend';
  } else if (maScore < 0 && (lowerHighs || lowerLows)) {
    direction = 'downtrend';
  }

  // HH/HL + MA による方向判定（rangeBasedBias適用前）
  const hhhlDirection = direction;

  // レンジ幅によるトレンド補助判定
  // HH/HL検出が曖昧でも、価格がレンジの端にいれば方向性を判定
  const rangeLookbackCount = timeframe ? RANGE_LOOKBACK[timeframe] : 30;
  const lookbackCandles = candles.slice(-rangeLookbackCount);
  let rangeHigh: number | null = null;
  let rangeLow: number | null = null;
  let rangePercent: number | null = null;
  let pricePositionInRange: number | null = null;
  let rangeBasedBias: 'uptrend' | 'downtrend' | 'neutral' = 'neutral';

  if (lookbackCandles.length >= 5) {
    rangeHigh = Math.max(...lookbackCandles.map(c => c.high));
    rangeLow = Math.min(...lookbackCandles.map(c => c.low));
    rangePercent = (rangeHigh - rangeLow) / rangeHigh * 100;
    const currentPrice = candles[candles.length - 1].close;
    pricePositionInRange = (currentPrice - rangeLow) / (rangeHigh - rangeLow);

    if (rangePercent >= 5) {
      // ダイナミック閾値: レンジ幅が大きいほど閾値を緩める
      // 狭いレンジ(5%): 端にいる時のみ判定 → 閾値0.35
      // 広いレンジ(15%+): 中間寄りでも方向性あり → 閾値0.45
      const dynamicThreshold = calcDynamicThreshold(rangePercent);
      if (pricePositionInRange < dynamicThreshold) rangeBasedBias = 'downtrend';
      else if (pricePositionInRange > (1 - dynamicThreshold)) rangeBasedBias = 'uptrend';
    }

    // rangeBasedBias が HH/HL判定と矛盾する場合も考慮
    if (rangeBasedBias !== 'neutral') {
      if (direction === 'range') {
        // HH/HL不明確 → rangeBasedBias を採用
        direction = rangeBasedBias;
      } else if (direction !== rangeBasedBias && rangePercent >= 8) {
        // HH/HLとrangeBasedBiasが矛盾 + レンジ幅が十分に大きい(8%以上)
        // → rangeBasedBias を優先（大きなレンジ幅は直近の小動きより信頼性が高い）
        direction = rangeBasedBias;
      }
      // それ以外: HH/HL判定を維持
    }
  }

  // Strength from ADX
  let strength: TrendStrength = 'moderate';
  if (adx != null) {
    if (adx >= 30) strength = 'strong';
    else if (adx >= 20) strength = 'moderate';
    else strength = 'weak';
  }

  // デバッグ情報（APIレスポンスに含めて本番診断用）
  const _debug: TrendDebugInfo | undefined = timeframe ? {
    candleCount: candles.length,
    firstCandleTime: candles[0]?.time ? new Date(candles[0].time).toISOString() : null,
    lastCandleTime: candles[candles.length - 1]?.time ? new Date(candles[candles.length - 1].time).toISOString() : null,
    rangeHigh,
    rangeLow,
    rangePercent: rangePercent != null ? Math.round(rangePercent * 100) / 100 : null,
    currentPrice: candles[candles.length - 1].close,
    pricePositionInRange: pricePositionInRange != null ? Math.round(pricePositionInRange * 1000) / 1000 : null,
    swingHighs: recentHighs,
    swingLows: recentLows,
    lowerHighs,
    lowerLows,
    hhhlDirection,
    maScore,
    rangeBasedBias,
    dynamicThreshold: rangePercent != null && rangePercent >= 5 ? Math.round(calcDynamicThreshold(rangePercent) * 1000) / 1000 : null,
    rangeLookbackCount,
    ema20: ema20 ?? null,
    ema50: ema50 ?? null,
    sma200: sma200 ?? null,
    adx: adx ?? null,
  } : undefined;

  return { direction, strength, maAlignment, higherHighs, higherLows, _debug };
}

const FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;

/**
 * Analyze pullback depth using Fibonacci retracement from the most recent swing.
 */
export function analyzePullback(candles: OHLCV[], trend: TrendAnalysis): PullbackAnalysis | undefined {
  if (candles.length < 20) return undefined;

  const swings = detectSwings(candles, 5);
  const currentPrice = candles[candles.length - 1].close;

  if (trend.direction === 'uptrend' && swings.highs.length >= 1 && swings.lows.length >= 1) {
    const swingHigh = swings.highs[swings.highs.length - 1];
    const swingLow = swings.lows[swings.lows.length - 1];
    if (swingHigh <= swingLow) return undefined;

    const range = swingHigh - swingLow;
    const retracement = (swingHigh - currentPrice) / range;

    if (retracement <= 0) return undefined; // Not pulling back

    const closestFib = FIB_LEVELS.reduce((best, fib) =>
      Math.abs(retracement - fib) < Math.abs(retracement - best) ? fib : best
    );

    const depth = closestFib <= 0.382 ? 'shallow' : closestFib <= 0.618 ? 'moderate' : 'deep';

    return {
      fibLevel: closestFib,
      depth,
      retestDetected: false,
      description: `上昇波の${(closestFib * 100).toFixed(1)}%戻し付近（${depth === 'shallow' ? '浅い押し目' : depth === 'moderate' ? '標準的な押し目' : '深い押し目'}）`,
    };
  }

  if (trend.direction === 'downtrend' && swings.highs.length >= 1 && swings.lows.length >= 1) {
    const swingHigh = swings.highs[swings.highs.length - 1];
    const swingLow = swings.lows[swings.lows.length - 1];
    if (swingHigh <= swingLow) return undefined;

    const range = swingHigh - swingLow;
    const retracement = (currentPrice - swingLow) / range;

    if (retracement <= 0) return undefined;

    const closestFib = FIB_LEVELS.reduce((best, fib) =>
      Math.abs(retracement - fib) < Math.abs(retracement - best) ? fib : best
    );

    const depth = closestFib <= 0.382 ? 'shallow' : closestFib <= 0.618 ? 'moderate' : 'deep';

    return {
      fibLevel: closestFib,
      depth,
      retestDetected: false,
      description: `下落波の${(closestFib * 100).toFixed(1)}%戻し付近（${depth === 'shallow' ? '浅い戻り' : depth === 'moderate' ? '標準的な戻り' : '深い戻り'}）`,
    };
  }

  return undefined;
}

/**
 * Detect if price is retesting a recently broken S/R level.
 */
export function detectRetest(
  candles: OHLCV[],
  levels: PriceLevel[],
  pullback: PullbackAnalysis | undefined
): PullbackAnalysis | undefined {
  if (!pullback || candles.length < 10) return pullback;

  const currentPrice = candles[candles.length - 1].close;
  const threshold = currentPrice * 0.003; // within 0.3%

  for (const level of levels) {
    if (Math.abs(currentPrice - level.price) < threshold) {
      return {
        ...pullback,
        retestDetected: true,
        retestLevel: level.price,
        description: pullback.description + `。$${level.price.toLocaleString()}のリテスト中`,
      };
    }
  }

  return pullback;
}
