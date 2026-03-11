import { OHLCV, CandlePattern, FalseBreakout, WickRejectionZone, VolumeSpike, PriceLevel } from './types';

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

  // ===== Chart Formation Patterns =====
  if (candles.length >= 20) {
    const formations = detectFormations(candles);
    patterns.push(...formations);
  }

  return patterns;
}

// ===== Chart Formation Detection =====

function findSwingHighs(candles: OHLCV[], lookback: number = 3): { index: number; price: number }[] {
  const swings: { index: number; price: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high < candles[i - j].high || candles[i].high < candles[i + j].high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) swings.push({ index: i, price: candles[i].high });
  }
  return swings;
}

function findSwingLows(candles: OHLCV[], lookback: number = 3): { index: number; price: number }[] {
  const swings: { index: number; price: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].low > candles[i - j].low || candles[i].low > candles[i + j].low) {
        isLow = false;
        break;
      }
    }
    if (isLow) swings.push({ index: i, price: candles[i].low });
  }
  return swings;
}

function detectFormations(candles: OHLCV[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  const highs = findSwingHighs(candles);
  const lows = findSwingLows(candles);

  if (highs.length < 2 || lows.length < 2) return patterns;

  const currentPrice = candles[candles.length - 1].close;
  const priceRange = Math.max(...candles.slice(-30).map((c) => c.high)) - Math.min(...candles.slice(-30).map((c) => c.low));
  const threshold = priceRange * 0.03; // 3% tolerance for "same level"

  // Use last few swing points
  const recentHighs = highs.slice(-4);
  const recentLows = lows.slice(-4);

  // Double Top: two highs at similar level with a valley between
  if (recentHighs.length >= 2) {
    const h1 = recentHighs[recentHighs.length - 2];
    const h2 = recentHighs[recentHighs.length - 1];
    if (Math.abs(h1.price - h2.price) < threshold && h2.index > h1.index + 3) {
      // Current price should be below the double top
      if (currentPrice < h2.price * 0.99) {
        patterns.push({ type: 'double_top', label: `ダブルトップ ($${h2.price.toFixed(0)}付近)`, signal: 'bearish' });
      }
    }
  }

  // Double Bottom: two lows at similar level with a peak between
  if (recentLows.length >= 2) {
    const l1 = recentLows[recentLows.length - 2];
    const l2 = recentLows[recentLows.length - 1];
    if (Math.abs(l1.price - l2.price) < threshold && l2.index > l1.index + 3) {
      if (currentPrice > l2.price * 1.01) {
        patterns.push({ type: 'double_bottom', label: `ダブルボトム ($${l2.price.toFixed(0)}付近)`, signal: 'bullish' });
      }
    }
  }

  // Triangle patterns: check if highs converging toward lows
  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const h1 = recentHighs[recentHighs.length - 2];
    const h2 = recentHighs[recentHighs.length - 1];
    const l1 = recentLows[recentLows.length - 2];
    const l2 = recentLows[recentLows.length - 1];

    const highsDescending = h2.price < h1.price - threshold * 0.5;
    const highsFlat = Math.abs(h2.price - h1.price) < threshold;
    const lowsAscending = l2.price > l1.price + threshold * 0.5;
    const lowsFlat = Math.abs(l2.price - l1.price) < threshold;

    // Ascending triangle: flat highs, rising lows
    if (highsFlat && lowsAscending) {
      patterns.push({ type: 'ascending_triangle', label: '上昇三角形', signal: 'bullish' });
    }
    // Descending triangle: falling highs, flat lows
    if (highsDescending && lowsFlat) {
      patterns.push({ type: 'descending_triangle', label: '下降三角形', signal: 'bearish' });
    }
    // Symmetrical triangle: falling highs, rising lows (converging)
    if (highsDescending && lowsAscending) {
      patterns.push({ type: 'symmetrical_triangle', label: '対称三角形', signal: 'neutral' });
    }

    // Wedge patterns: both moving same direction but converging
    const highsRising = h2.price > h1.price + threshold * 0.5;
    const lowsDescending = l2.price < l1.price - threshold * 0.5;

    // Rising wedge: both rising but range narrowing
    if (highsRising && lowsAscending) {
      const range1 = h1.price - l1.price;
      const range2 = h2.price - l2.price;
      if (range2 < range1 * 0.8) {
        patterns.push({ type: 'rising_wedge', label: '上昇ウェッジ', signal: 'bearish' });
      }
    }
    // Falling wedge: both falling but range narrowing
    if (highsDescending && lowsDescending) {
      const range1 = h1.price - l1.price;
      const range2 = h2.price - l2.price;
      if (range2 < range1 * 0.8) {
        patterns.push({ type: 'falling_wedge', label: '下降ウェッジ', signal: 'bullish' });
      }
    }
  }

  // Flag patterns: strong move followed by gentle counter-trend consolidation
  if (candles.length >= 15) {
    const flagCandles = candles.slice(-15);
    // Check first 5 candles for strong impulse, last 10 for consolidation
    const impulse = flagCandles.slice(0, 5);
    const consolidation = flagCandles.slice(5);
    const impulseMove = impulse[impulse.length - 1].close - impulse[0].open;
    const impulseRange = Math.abs(impulseMove);
    const consolMove = consolidation[consolidation.length - 1].close - consolidation[0].open;
    const consolRange = Math.max(...consolidation.map((c) => c.high)) - Math.min(...consolidation.map((c) => c.low));

    if (impulseRange > 0 && consolRange < impulseRange * 0.5) {
      // Bull flag: strong up move, gentle down drift
      if (impulseMove > 0 && consolMove < 0 && Math.abs(consolMove) < impulseRange * 0.4) {
        patterns.push({ type: 'bull_flag', label: 'ブルフラッグ', signal: 'bullish' });
      }
      // Bear flag: strong down move, gentle up drift
      if (impulseMove < 0 && consolMove > 0 && Math.abs(consolMove) < impulseRange * 0.4) {
        patterns.push({ type: 'bear_flag', label: 'ベアフラッグ', signal: 'bearish' });
      }
    }
  }

  return patterns;
}

// ===== False Breakout Detection =====

export function detectFalseBreakouts(
  candles: OHLCV[],
  levels: PriceLevel[],
): FalseBreakout[] {
  if (candles.length < 5) return [];
  const result: FalseBreakout[] = [];

  // Check last 3 candles for false breakouts of S/R levels
  const recent = candles.slice(-3);

  for (const level of levels) {
    for (let i = 0; i < recent.length - 1; i++) {
      const candle = recent[i];
      const nextCandle = recent[i + 1];

      // Upside fakeout: wick above resistance but close below
      if (level.type === 'resistance') {
        if (candle.high > level.price && candle.close < level.price && nextCandle.close < level.price) {
          result.push({
            level: level.price,
            direction: 'upside_fakeout',
            description: `$${level.price.toLocaleString()} を上抜けるもヒゲで否定（ダマシ上抜け）`,
          });
        }
      }

      // Downside fakeout: wick below support but close above
      if (level.type === 'support') {
        if (candle.low < level.price && candle.close > level.price && nextCandle.close > level.price) {
          result.push({
            level: level.price,
            direction: 'downside_fakeout',
            description: `$${level.price.toLocaleString()} を下抜けるもヒゲで否定（ダマシ下抜け）`,
          });
        }
      }
    }
  }

  return result;
}

// ===== Wick Rejection Zone Detection =====

export function detectWickRejections(candles: OHLCV[]): WickRejectionZone[] {
  if (candles.length < 10) return [];

  const currentPrice = candles[candles.length - 1].close;
  const threshold = currentPrice * 0.003; // cluster within 0.3%
  const zones: { price: number; count: number; side: 'upper' | 'lower' }[] = [];

  // Analyze last 30 candles for repeated wick rejections
  const recent = candles.slice(-30);

  for (const candle of recent) {
    const range = totalRange(candle);
    if (range === 0) continue;

    const uShadow = upperShadow(candle);
    const lShadow = lowerShadow(candle);

    // Upper wick rejection: significant upper shadow (>40% of range)
    if (uShadow > range * 0.4 && uShadow > bodySize(candle)) {
      const rejPrice = candle.high;
      const existing = zones.find((z) => z.side === 'upper' && Math.abs(z.price - rejPrice) < threshold);
      if (existing) {
        existing.price = (existing.price * existing.count + rejPrice) / (existing.count + 1);
        existing.count++;
      } else {
        zones.push({ price: rejPrice, count: 1, side: 'upper' });
      }
    }

    // Lower wick rejection: significant lower shadow (>40% of range)
    if (lShadow > range * 0.4 && lShadow > bodySize(candle)) {
      const rejPrice = candle.low;
      const existing = zones.find((z) => z.side === 'lower' && Math.abs(z.price - rejPrice) < threshold);
      if (existing) {
        existing.price = (existing.price * existing.count + rejPrice) / (existing.count + 1);
        existing.count++;
      } else {
        zones.push({ price: rejPrice, count: 1, side: 'lower' });
      }
    }
  }

  // Only return zones with 2+ rejections
  return zones
    .filter((z) => z.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((z) => ({
      price: Math.round(z.price * 100) / 100,
      count: z.count,
      side: z.side,
      description: z.side === 'upper'
        ? `$${z.price.toFixed(0)}付近で${z.count}回上ヒゲ否定（売り圧力ゾーン）`
        : `$${z.price.toFixed(0)}付近で${z.count}回下ヒゲ否定（買い圧力ゾーン）`,
    }));
}

// ===== Volume Spike Detection =====

export function detectVolumeSpikes(candles: OHLCV[]): VolumeSpike[] {
  if (candles.length < 20) return [];

  const spikes: VolumeSpike[] = [];
  const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;

  // Check last 5 candles for volume spikes
  for (const candle of candles.slice(-5)) {
    const ratio = avgVolume > 0 ? candle.volume / avgVolume : 1;
    if (ratio >= 2.0) {
      const direction = candle.close >= candle.open ? 'up' : 'down';
      spikes.push({
        time: candle.time,
        volumeRatio: Math.round(ratio * 100) / 100,
        priceDirection: direction,
        description: `出来高${ratio.toFixed(1)}倍スパイク（${direction === 'up' ? '陽線' : '陰線'}）`,
      });
    }
  }

  return spikes;
}
