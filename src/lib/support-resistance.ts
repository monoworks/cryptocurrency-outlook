import { OHLCV, PriceLevel } from './types';

export function detectSupportResistance(candles: OHLCV[], currentPrice: number): PriceLevel[] {
  if (candles.length < 10) return [];

  // Collect all potential pivot points
  const pivots: number[] = [];
  const lookback = 3;

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high < candles[i - j].high || candles[i].high < candles[i + j].high) isHigh = false;
      if (candles[i].low > candles[i - j].low || candles[i].low > candles[i + j].low) isLow = false;
    }

    if (isHigh) pivots.push(candles[i].high);
    if (isLow) pivots.push(candles[i].low);
  }

  // Add recent high/low
  const recentSlice = candles.slice(-20);
  const recentHigh = Math.max(...recentSlice.map((c) => c.high));
  const recentLow = Math.min(...recentSlice.map((c) => c.low));
  pivots.push(recentHigh, recentLow);

  // Cluster nearby pivots (within 0.5% of each other)
  const clusterThreshold = currentPrice * 0.005;
  const clusters: { price: number; count: number }[] = [];

  const sorted = [...pivots].sort((a, b) => a - b);

  for (const p of sorted) {
    const existing = clusters.find((c) => Math.abs(c.price - p) < clusterThreshold);
    if (existing) {
      existing.price = (existing.price * existing.count + p) / (existing.count + 1);
      existing.count++;
    } else {
      clusters.push({ price: p, count: 1 });
    }
  }

  // Convert to PriceLevels
  const levels: PriceLevel[] = clusters
    .filter((c) => c.count >= 1)
    .map((c) => ({
      price: Math.round(c.price * 100) / 100,
      strength: Math.min(5, c.count),
      type: c.price >= currentPrice ? 'resistance' as const : 'support' as const,
      touchCount: c.count,
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);

  return levels;
}
