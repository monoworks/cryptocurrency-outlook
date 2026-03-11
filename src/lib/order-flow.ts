import { OHLCV } from './types';

export interface OrderFlowAnalysis {
  takerBuyRatio: number;          // 0-1, taker buy volume / total volume
  takerSellRatio: number;         // 0-1
  imbalance: number;              // -1 to +1, positive = buy pressure
  recentImbalance: number;        // last 5 candles imbalance
  trend: 'buy_dominant' | 'sell_dominant' | 'balanced';
  description: string;
}

/**
 * Analyze order flow imbalance from taker buy/sell volume.
 * Uses the takerBuyVolume field from Binance klines (index 9).
 *
 * Since standard OHLCV doesn't include taker buy volume,
 * this function estimates from price action:
 * - Bullish candle (close > open): most volume is buy-side
 * - Bearish candle (close < open): most volume is sell-side
 * - Weighted by candle body / total range ratio
 */
export function analyzeOrderFlow(candles: OHLCV[], takerBuyVolumes?: number[]): OrderFlowAnalysis {
  if (candles.length === 0) {
    return {
      takerBuyRatio: 0.5, takerSellRatio: 0.5, imbalance: 0, recentImbalance: 0,
      trend: 'balanced', description: 'データ不足',
    };
  }

  let totalVolume = 0;
  let totalBuyVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    totalVolume += c.volume;

    if (takerBuyVolumes && takerBuyVolumes[i] != null) {
      // Use actual taker buy volume from Binance
      totalBuyVolume += takerBuyVolumes[i];
    } else {
      // Estimate from price action
      const range = c.high - c.low;
      if (range <= 0) {
        totalBuyVolume += c.volume * 0.5;
        continue;
      }
      const body = Math.abs(c.close - c.open);
      const bodyRatio = body / range;
      // Bullish candle: higher % is buy
      if (c.close >= c.open) {
        totalBuyVolume += c.volume * (0.5 + bodyRatio * 0.3);
      } else {
        totalBuyVolume += c.volume * (0.5 - bodyRatio * 0.3);
      }
    }
  }

  const takerBuyRatio = totalVolume > 0 ? totalBuyVolume / totalVolume : 0.5;
  const takerSellRatio = 1 - takerBuyRatio;
  const imbalance = takerBuyRatio - takerSellRatio; // -1 to +1

  // Recent 5 candles for short-term trend
  const recentSlice = candles.slice(-5);
  let recentBuy = 0;
  let recentTotal = 0;
  const recentOffset = candles.length - recentSlice.length;
  for (let i = 0; i < recentSlice.length; i++) {
    const c = recentSlice[i];
    recentTotal += c.volume;
    if (takerBuyVolumes && takerBuyVolumes[recentOffset + i] != null) {
      recentBuy += takerBuyVolumes[recentOffset + i];
    } else {
      const range = c.high - c.low;
      if (range <= 0) { recentBuy += c.volume * 0.5; continue; }
      const body = Math.abs(c.close - c.open);
      const bodyRatio = body / range;
      if (c.close >= c.open) recentBuy += c.volume * (0.5 + bodyRatio * 0.3);
      else recentBuy += c.volume * (0.5 - bodyRatio * 0.3);
    }
  }
  const recentBuyRatio = recentTotal > 0 ? recentBuy / recentTotal : 0.5;
  const recentImbalance = (recentBuyRatio - (1 - recentBuyRatio));

  let trend: OrderFlowAnalysis['trend'];
  if (imbalance > 0.06) trend = 'buy_dominant';
  else if (imbalance < -0.06) trend = 'sell_dominant';
  else trend = 'balanced';

  const trendLabel = trend === 'buy_dominant' ? '買い優勢' : trend === 'sell_dominant' ? '売り優勢' : '均衡';
  const recentLabel = recentImbalance > 0.06 ? '直近買い加速' : recentImbalance < -0.06 ? '直近売り加速' : '直近均衡';

  const description = `${trendLabel} (買${(takerBuyRatio * 100).toFixed(1)}%/売${(takerSellRatio * 100).toFixed(1)}%), ${recentLabel}`;

  return { takerBuyRatio, takerSellRatio, imbalance, recentImbalance, trend, description };
}
