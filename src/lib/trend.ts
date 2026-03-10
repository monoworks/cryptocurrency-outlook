import { OHLCV, IndicatorValues, TrendAnalysis, TrendDirection, TrendStrength } from './types';

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
