import { OHLCV, IndicatorValues } from './types';

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'quiet';

export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  label: string;
  description: string;
  bbWidth: number;       // Bollinger Band width as % of price
  atrPercent: number;    // ATR as % of price
  adx: number;
  volatilityRank: 'high' | 'normal' | 'low';
}

/**
 * Classify current market regime based on ADX, ATR, BB width.
 * - trending_up: ADX≥25 + uptrend direction
 * - trending_down: ADX≥25 + downtrend direction
 * - ranging: ADX<20 + low volatility
 * - volatile: high ATR + wide BB, regardless of ADX
 * - quiet: very low ATR + narrow BB
 */
export function classifyMarketRegime(
  candles: OHLCV[],
  indicators: IndicatorValues,
  trendDirection: 'uptrend' | 'downtrend' | 'range',
): MarketRegimeAnalysis {
  const currentPrice = candles[candles.length - 1].close;
  const adx = indicators.adx ?? 20;
  const atr = indicators.atr ?? 0;
  const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  // BB width as percentage of middle band
  let bbWidth = 0;
  if (indicators.bollingerBands) {
    const bb = indicators.bollingerBands;
    bbWidth = bb.middle > 0 ? ((bb.upper - bb.lower) / bb.middle) * 100 : 0;
  }

  // Historical ATR comparison for volatility ranking
  // Use recent 20 candles to compute average range as baseline
  const recent = candles.slice(-20);
  const avgRange = recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
  const avgRangePercent = currentPrice > 0 ? (avgRange / currentPrice) * 100 : 0;

  let volatilityRank: 'high' | 'normal' | 'low';
  if (atrPercent > avgRangePercent * 1.3) volatilityRank = 'high';
  else if (atrPercent < avgRangePercent * 0.7) volatilityRank = 'low';
  else volatilityRank = 'normal';

  let regime: MarketRegime;
  let label: string;
  let description: string;

  // Volatile: high ATR + wide BB (regardless of trend)
  if (volatilityRank === 'high' && bbWidth > 4) {
    regime = 'volatile';
    label = '高ボラティリティ';
    description = `ATR=${atrPercent.toFixed(2)}%, BB幅=${bbWidth.toFixed(1)}%。急激な値動きに注意。ポジションサイズを縮小推奨。`;
  }
  // Quiet: very low volatility
  else if (volatilityRank === 'low' && bbWidth < 2 && adx < 20) {
    regime = 'quiet';
    label = '低ボラティリティ';
    description = `ATR=${atrPercent.toFixed(2)}%, BB幅=${bbWidth.toFixed(1)}%。スクイーズ中 — ブレイクアウトに備える。`;
  }
  // Trending
  else if (adx >= 25) {
    if (trendDirection === 'uptrend') {
      regime = 'trending_up';
      label = '上昇トレンド';
      description = `ADX=${adx.toFixed(0)}, トレンドフォロー戦略推奨。押し目買い有効。`;
    } else if (trendDirection === 'downtrend') {
      regime = 'trending_down';
      label = '下落トレンド';
      description = `ADX=${adx.toFixed(0)}, トレンドフォロー戦略推奨。戻り売り有効。`;
    } else {
      regime = 'ranging';
      label = 'レンジ';
      description = `ADX=${adx.toFixed(0)}だがトレンド方向不明瞭。S/R間の逆張り戦略推奨。`;
    }
  }
  // Ranging
  else {
    regime = 'ranging';
    label = 'レンジ';
    description = `ADX=${adx.toFixed(0)}, BB幅=${bbWidth.toFixed(1)}%。レンジ上下限での逆張り戦略推奨。`;
  }

  return { regime, label, description, bbWidth, atrPercent, adx, volatilityRank };
}
