import { OHLCV } from './types';

export interface VolumeProfileLevel {
  priceMin: number;
  priceMax: number;
  priceMid: number;
  volume: number;
  percentage: number; // % of total volume
}

export interface VolumeProfileAnalysis {
  poc: number;                    // Point of Control (price with highest volume)
  pocVolume: number;
  valueAreaHigh: number;          // 70% of volume above this
  valueAreaLow: number;           // 70% of volume below this
  levels: VolumeProfileLevel[];   // all bins
  currentPriceVsVA: 'above' | 'inside' | 'below';
  description: string;
}

/**
 * Build volume profile from OHLCV candles.
 * Distributes each candle's volume across its price range using bins.
 */
export function buildVolumeProfile(candles: OHLCV[], bins = 30): VolumeProfileAnalysis {
  if (candles.length === 0) {
    return {
      poc: 0, pocVolume: 0, valueAreaHigh: 0, valueAreaLow: 0,
      levels: [], currentPriceVsVA: 'inside', description: 'データ不足',
    };
  }

  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  const priceHigh = Math.max(...allHighs);
  const priceLow = Math.min(...allLows);
  const range = priceHigh - priceLow;

  if (range <= 0) {
    return {
      poc: candles[0].close, pocVolume: 0, valueAreaHigh: candles[0].close, valueAreaLow: candles[0].close,
      levels: [], currentPriceVsVA: 'inside', description: '価格レンジなし',
    };
  }

  const binSize = range / bins;
  const volumeBins: number[] = new Array(bins).fill(0);

  // Distribute each candle's volume across the bins it touches
  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    if (candleRange <= 0) {
      // Single-price candle: put all volume in the matching bin
      const idx = Math.min(Math.floor((candle.close - priceLow) / binSize), bins - 1);
      volumeBins[idx] += candle.volume;
      continue;
    }

    // Distribute volume proportionally across bins the candle spans
    const startBin = Math.max(0, Math.floor((candle.low - priceLow) / binSize));
    const endBin = Math.min(bins - 1, Math.floor((candle.high - priceLow) / binSize));
    const binsSpanned = endBin - startBin + 1;
    const volPerBin = candle.volume / binsSpanned;

    for (let i = startBin; i <= endBin; i++) {
      volumeBins[i] += volPerBin;
    }
  }

  const totalVolume = volumeBins.reduce((a, b) => a + b, 0);

  // Build levels
  const levels: VolumeProfileLevel[] = volumeBins.map((vol, i) => ({
    priceMin: priceLow + i * binSize,
    priceMax: priceLow + (i + 1) * binSize,
    priceMid: priceLow + (i + 0.5) * binSize,
    volume: vol,
    percentage: totalVolume > 0 ? (vol / totalVolume) * 100 : 0,
  }));

  // Find POC (bin with maximum volume)
  let maxVolIdx = 0;
  for (let i = 1; i < volumeBins.length; i++) {
    if (volumeBins[i] > volumeBins[maxVolIdx]) maxVolIdx = i;
  }
  const poc = levels[maxVolIdx].priceMid;
  const pocVolume = volumeBins[maxVolIdx];

  // Value Area: 70% of total volume centered around POC
  const targetVolume = totalVolume * 0.7;
  let vaVolume = volumeBins[maxVolIdx];
  let vaLowIdx = maxVolIdx;
  let vaHighIdx = maxVolIdx;

  while (vaVolume < targetVolume && (vaLowIdx > 0 || vaHighIdx < bins - 1)) {
    const canGoLow = vaLowIdx > 0;
    const canGoHigh = vaHighIdx < bins - 1;

    if (canGoLow && canGoHigh) {
      // Expand toward whichever side has more volume
      if (volumeBins[vaLowIdx - 1] >= volumeBins[vaHighIdx + 1]) {
        vaLowIdx--;
        vaVolume += volumeBins[vaLowIdx];
      } else {
        vaHighIdx++;
        vaVolume += volumeBins[vaHighIdx];
      }
    } else if (canGoLow) {
      vaLowIdx--;
      vaVolume += volumeBins[vaLowIdx];
    } else {
      vaHighIdx++;
      vaVolume += volumeBins[vaHighIdx];
    }
  }

  const valueAreaLow = levels[vaLowIdx].priceMin;
  const valueAreaHigh = levels[vaHighIdx].priceMax;
  const currentPrice = candles[candles.length - 1].close;

  let currentPriceVsVA: 'above' | 'inside' | 'below';
  if (currentPrice > valueAreaHigh) currentPriceVsVA = 'above';
  else if (currentPrice < valueAreaLow) currentPriceVsVA = 'below';
  else currentPriceVsVA = 'inside';

  const vaDesc = currentPriceVsVA === 'above'
    ? 'VA上方 — VAH回帰 or 上昇継続'
    : currentPriceVsVA === 'below'
      ? 'VA下方 — VAL回帰 or 下落継続'
      : 'VA内 — POC付近でのレンジ推移';

  const description = `POC: $${poc.toFixed(0)}, VA: $${valueAreaLow.toFixed(0)}-$${valueAreaHigh.toFixed(0)} (${vaDesc})`;

  return { poc, pocVolume, valueAreaHigh, valueAreaLow, levels, currentPriceVsVA, description };
}
