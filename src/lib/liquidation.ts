import { OHLCV } from './types';

export interface LiquidationLevel {
  price: number;
  side: 'long' | 'short';       // which positions get liquidated here
  leverage: number;               // estimated leverage
  intensity: 'high' | 'medium' | 'low';
  description: string;
}

export interface LiquidationAnalysis {
  levels: LiquidationLevel[];
  nearestLongLiq: number | null;   // nearest price where longs get liquidated
  nearestShortLiq: number | null;  // nearest price where shorts get liquidated
  magnetZone: string | null;       // likely magnet zone description
}

/**
 * Estimate liquidation levels based on common leverage levels (5x, 10x, 20x, 50x, 100x)
 * and recent price action (swing highs/lows as likely entry points).
 *
 * This is a heuristic estimation — real liquidation data requires exchange-specific APIs.
 */
export function estimateLiquidationLevels(
  candles: OHLCV[],
  currentPrice: number,
): LiquidationAnalysis {
  const leverages = [5, 10, 20, 50, 100];
  const levels: LiquidationLevel[] = [];

  // Find likely entry points from recent swing highs/lows
  const recent = candles.slice(-50);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      swingHighs.push(recent[i].high);
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      swingLows.push(recent[i].low);
    }
  }

  // Add current price as a reference point
  const entryPoints = [currentPrice, ...swingHighs.slice(-3), ...swingLows.slice(-3)];

  for (const entry of entryPoints) {
    for (const leverage of leverages) {
      // Long liquidation: price drops by (1/leverage) * maintenance margin factor
      // Simplified: liquidation ≈ entry * (1 - 1/leverage * 0.85)
      const longLiqPrice = entry * (1 - 0.85 / leverage);

      // Short liquidation: price rises by (1/leverage) * maintenance margin factor
      const shortLiqPrice = entry * (1 + 0.85 / leverage);

      // Only include levels near current price (within 20%)
      if (longLiqPrice > currentPrice * 0.8 && longLiqPrice < currentPrice) {
        const distPercent = ((currentPrice - longLiqPrice) / currentPrice) * 100;
        const intensity = distPercent < 3 ? 'high' : distPercent < 8 ? 'medium' : 'low';
        levels.push({
          price: Math.round(longLiqPrice * 100) / 100,
          side: 'long',
          leverage,
          intensity,
          description: `ロング清算 (${leverage}x, エントリー≈$${entry.toFixed(0)}): $${longLiqPrice.toFixed(0)} (-${distPercent.toFixed(1)}%)`,
        });
      }

      if (shortLiqPrice < currentPrice * 1.2 && shortLiqPrice > currentPrice) {
        const distPercent = ((shortLiqPrice - currentPrice) / currentPrice) * 100;
        const intensity = distPercent < 3 ? 'high' : distPercent < 8 ? 'medium' : 'low';
        levels.push({
          price: Math.round(shortLiqPrice * 100) / 100,
          side: 'short',
          leverage,
          intensity,
          description: `ショート清算 (${leverage}x, エントリー≈$${entry.toFixed(0)}): $${shortLiqPrice.toFixed(0)} (+${distPercent.toFixed(1)}%)`,
        });
      }
    }
  }

  // Deduplicate: cluster levels within 0.3%
  const threshold = currentPrice * 0.003;
  const clustered: LiquidationLevel[] = [];
  const sortedLevels = levels.sort((a, b) => a.price - b.price);

  for (const level of sortedLevels) {
    const existing = clustered.find((c) => Math.abs(c.price - level.price) < threshold && c.side === level.side);
    if (existing) {
      // Keep the higher leverage (more significant)
      if (level.leverage > existing.leverage) {
        existing.leverage = level.leverage;
        existing.description = level.description;
      }
      if (level.intensity === 'high') existing.intensity = 'high';
    } else {
      clustered.push({ ...level });
    }
  }

  // Find nearest levels
  const longLiqs = clustered.filter((l) => l.side === 'long').sort((a, b) => b.price - a.price);
  const shortLiqs = clustered.filter((l) => l.side === 'short').sort((a, b) => a.price - b.price);

  const nearestLongLiq = longLiqs.length > 0 ? longLiqs[0].price : null;
  const nearestShortLiq = shortLiqs.length > 0 ? shortLiqs[0].price : null;

  // Determine magnet zone (high intensity liquidation clusters)
  const highIntensity = clustered.filter((l) => l.intensity === 'high');
  let magnetZone: string | null = null;
  if (highIntensity.length > 0) {
    const nearest = highIntensity.sort((a, b) =>
      Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice)
    )[0];
    magnetZone = `$${nearest.price.toFixed(0)} (${nearest.side === 'long' ? 'ロング' : 'ショート'}清算集中, ${nearest.leverage}x) — 価格が吸い寄せられやすい`;
  }

  // Limit to top 10 most relevant
  const topLevels = clustered
    .sort((a, b) => {
      const distA = Math.abs(a.price - currentPrice);
      const distB = Math.abs(b.price - currentPrice);
      return distA - distB;
    })
    .slice(0, 10);

  return { levels: topLevels, nearestLongLiq, nearestShortLiq, magnetZone };
}
