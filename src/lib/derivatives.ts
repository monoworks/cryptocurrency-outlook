import { MarketData, DerivativesAnalysis, OIPriceSignal, DerivativesHistory, OIChange, FundingTrend } from './types';

function analyzeOIChange(history: { time: number; oi: number }[]): OIChange | undefined {
  if (history.length < 2) return undefined;

  const current = history[history.length - 1].oi;
  // Compare to value ~6h ago or earliest available
  const compareIdx = Math.max(0, history.length - 7);
  const previous = history[compareIdx].oi;
  const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  let direction: OIChange['direction'] = 'stable';
  if (changePercent > 1) direction = 'increasing';
  else if (changePercent < -1) direction = 'decreasing';

  return { current, previous, changePercent: Math.round(changePercent * 100) / 100, direction };
}

function analyzeFundingTrend(history: { time: number; rate: number }[]): FundingTrend | undefined {
  if (history.length < 3) return undefined;

  const current = history[history.length - 1].rate;
  const average = history.reduce((sum, h) => sum + h.rate, 0) / history.length;
  const recent3 = history.slice(-3).map((h) => h.rate);

  let trend: FundingTrend['trend'] = 'stable';
  if (recent3.length >= 3) {
    if (recent3[2] > recent3[1] && recent3[1] > recent3[0]) trend = 'rising';
    else if (recent3[2] < recent3[1] && recent3[1] < recent3[0]) trend = 'falling';
  }

  // Overheated: funding > 0.01% (annualized ~10%) or < -0.01%
  const isOverheated = Math.abs(current) > 0.0001;

  return { current, average, trend, isOverheated };
}

export function analyzeDerivatives(data: MarketData, history?: DerivativesHistory): DerivativesAnalysis {
  const { ticker, fundingRate, premiumIndex } = data;
  const priceChange = ticker.priceChangePercent;
  const funding = fundingRate.fundingRate;
  const markPrice = premiumIndex.markPrice;
  const indexPrice = premiumIndex.indexPrice;

  // Premium calculation (Mark - Index) / Index * 100
  const premium = indexPrice > 0 ? ((markPrice - indexPrice) / indexPrice) * 100 : 0;

  // Mark vs Oracle (index) divergence
  const markOracleDivergence = indexPrice > 0 ? ((markPrice - indexPrice) / indexPrice) * 100 : 0;

  // OI change from history
  const oiChange = history ? analyzeOIChange(history.oiHistory) : undefined;
  const fundingTrend = history ? analyzeFundingTrend(history.fundingHistory) : undefined;

  // OI × Price signal - use actual OI change if available
  let oiPriceSignal: OIPriceSignal = 'neutral';
  let oiPriceDescription = '';

  if (oiChange) {
    const oiIncreasing = oiChange.direction === 'increasing';
    if (oiIncreasing && priceChange > 0) {
      oiPriceSignal = 'new_longs';
      oiPriceDescription = `OI増加(${oiChange.changePercent > 0 ? '+' : ''}${oiChange.changePercent}%) + 価格上昇 → 新規ロング参入（強気）`;
    } else if (!oiIncreasing && oiChange.direction === 'decreasing' && priceChange > 0) {
      oiPriceSignal = 'short_cover';
      oiPriceDescription = `OI減少(${oiChange.changePercent}%) + 価格上昇 → ショートカバー主体（上昇持続力は弱い可能性）`;
    } else if (oiIncreasing && priceChange < 0) {
      oiPriceSignal = 'new_shorts';
      oiPriceDescription = `OI増加(+${oiChange.changePercent}%) + 価格下落 → 新規ショート参入（弱気）`;
    } else if (!oiIncreasing && oiChange.direction === 'decreasing' && priceChange < 0) {
      oiPriceSignal = 'long_liquidation';
      oiPriceDescription = `OI減少(${oiChange.changePercent}%) + 価格下落 → ロング清算`;
    } else {
      oiPriceDescription = `OI ${oiChange.direction === 'stable' ? '横ばい' : oiChange.direction === 'increasing' ? '微増' : '微減'} — 方向性なし`;
    }
  } else {
    // Fallback: use funding rate as proxy (old behavior)
    const fundingAbs = Math.abs(funding);
    const oiIncreasing = fundingAbs > 0.0001;
    if (oiIncreasing && priceChange > 0) {
      oiPriceSignal = 'new_longs';
      oiPriceDescription = 'OI増加推定 + 価格上昇 → 新規ロング参入（強気）';
    } else if (!oiIncreasing && priceChange > 0) {
      oiPriceSignal = 'short_cover';
      oiPriceDescription = 'OI減少推定 + 価格上昇 → ショートカバー主体（上昇持続力は弱い可能性）';
    } else if (oiIncreasing && priceChange < 0) {
      oiPriceSignal = 'new_shorts';
      oiPriceDescription = 'OI増加推定 + 価格下落 → 新規ショート参入（弱気）';
    } else if (!oiIncreasing && priceChange < 0) {
      oiPriceSignal = 'long_liquidation';
      oiPriceDescription = 'OI減少推定 + 価格下落 → ロング清算';
    } else {
      oiPriceDescription = '方向性なし';
    }
  }

  // Funding bias
  let fundingBias: 'long_heavy' | 'short_heavy' | 'neutral' = 'neutral';
  if (funding > 0.0005) {
    fundingBias = 'long_heavy';
  } else if (funding < -0.0005) {
    fundingBias = 'short_heavy';
  }

  // Premium signal
  let premiumSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (premium > 0.05) {
    premiumSignal = 'bullish';
  } else if (premium < -0.05) {
    premiumSignal = 'bearish';
  }

  return {
    oiPriceSignal,
    oiPriceDescription,
    fundingBias,
    fundingRate: funding,
    premium,
    premiumSignal,
    oiChange,
    fundingTrend,
    markOracleDivergence: Math.round(markOracleDivergence * 10000) / 10000,
  };
}
