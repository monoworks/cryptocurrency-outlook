import { OHLCV, IndicatorValues, TrendAnalysis, TrendDirection, TrendStrength, PullbackAnalysis, PriceLevel } from './types';

function detectSwings(candles: OHLCV[], lookback: number = 5): { highs: number[]; lows: number[] } {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) swingHighs.push(candles[i].high);
    if (isLow) swingLows.push(candles[i].low);
  }

  return { highs: swingHighs, lows: swingLows };
}

export function analyzeTrend(candles: OHLCV[], indicators: IndicatorValues): TrendAnalysis {
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

  // Swing high/low analysis
  const swings = detectSwings(candles);
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

  // Direction
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

  // Strength from ADX
  let strength: TrendStrength = 'moderate';
  if (adx != null) {
    if (adx >= 30) strength = 'strong';
    else if (adx >= 20) strength = 'moderate';
    else strength = 'weak';
  }

  return { direction, strength, maAlignment, higherHighs, higherLows };
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
