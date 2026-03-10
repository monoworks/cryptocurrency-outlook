import { OHLCV, CandlePattern } from './types';

function bodySize(c: OHLCV): number {
  return Math.abs(c.close - c.open);
}

function totalRange(c: OHLCV): number {
  return c.high - c.low;
}

function isBullish(c: OHLCV): boolean {
  return c.close > c.open;
}

function isBearish(c: OHLCV): boolean {
  return c.close < c.open;
}

function upperShadow(c: OHLCV): number {
  return c.high - Math.max(c.open, c.close);
}

function lowerShadow(c: OHLCV): number {
  return Math.min(c.open, c.close) - c.low;
}

export function detectPatterns(candles: OHLCV[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (candles.length < 3) return patterns;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const range = totalRange(last);

  if (range === 0) return patterns;

  // Doji - body is very small relative to range
  if (bodySize(last) / range < 0.1) {
    patterns.push({ type: 'doji', label: '十字線 (Doji)', signal: 'neutral' });
  }

  // Hammer - small body at top, long lower shadow
  if (lowerShadow(last) > bodySize(last) * 2 && upperShadow(last) < bodySize(last) * 0.5) {
    patterns.push({ type: 'hammer', label: 'ハンマー', signal: 'bullish' });
  }

  // Inverted Hammer - small body at bottom, long upper shadow
  if (upperShadow(last) > bodySize(last) * 2 && lowerShadow(last) < bodySize(last) * 0.5) {
    patterns.push({ type: 'inverted_hammer', label: '逆ハンマー', signal: 'bearish' });
  }

  // Long upper shadow
  if (upperShadow(last) > range * 0.6) {
    patterns.push({ type: 'long_upper_shadow', label: '長い上ヒゲ', signal: 'bearish' });
  }

  // Long lower shadow
  if (lowerShadow(last) > range * 0.6) {
    patterns.push({ type: 'long_lower_shadow', label: '長い下ヒゲ', signal: 'bullish' });
  }

  // Bullish Engulfing
  if (
    isBearish(prev) &&
    isBullish(last) &&
    last.open <= prev.close &&
    last.close >= prev.open
  ) {
    patterns.push({ type: 'bullish_engulfing', label: '強気の包み足', signal: 'bullish' });
  }

  // Bearish Engulfing
  if (
    isBullish(prev) &&
    isBearish(last) &&
    last.open >= prev.close &&
    last.close <= prev.open
  ) {
    patterns.push({ type: 'bearish_engulfing', label: '弱気の包み足', signal: 'bearish' });
  }

  // Consecutive bullish / bearish
  let bullCount = 0;
  let bearCount = 0;
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    if (isBullish(candles[i])) bullCount++;
    else break;
  }
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    if (isBearish(candles[i])) bearCount++;
    else break;
  }
  if (bullCount >= 3) {
    patterns.push({ type: 'consecutive_bullish', label: `${bullCount}連続陽線`, signal: 'bullish' });
  }
  if (bearCount >= 3) {
    patterns.push({ type: 'consecutive_bearish', label: `${bearCount}連続陰線`, signal: 'bearish' });
  }

  return patterns;
}
