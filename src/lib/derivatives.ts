import { MarketData, DerivativesAnalysis, OIPriceSignal } from './types';

export function analyzeDerivatives(data: MarketData): DerivativesAnalysis {
  const { ticker, fundingRate, premiumIndex } = data;
  const priceChange = ticker.priceChangePercent;
  const funding = fundingRate.fundingRate;
  const markPrice = premiumIndex.markPrice;
  const indexPrice = premiumIndex.indexPrice;

  // Premium calculation (Mark - Index) / Index * 100
  const premium = indexPrice > 0 ? ((markPrice - indexPrice) / indexPrice) * 100 : 0;

  // OI × Price signal
  // Note: We don't have historical OI from a single call, so we use price change direction
  // as a proxy. In production, you'd compare OI changes over time.
  let oiPriceSignal: OIPriceSignal = 'neutral';
  let oiPriceDescription = '';

  // Use funding rate as a proxy for OI direction:
  // High positive funding = lots of longs (OI likely increasing on buy side)
  // High negative funding = lots of shorts (OI likely increasing on sell side)
  const fundingAbs = Math.abs(funding);
  const oiIncreasing = fundingAbs > 0.0001; // significant funding = active positioning

  if (oiIncreasing && priceChange > 0) {
    oiPriceSignal = 'new_longs';
    oiPriceDescription = 'OI増加 + 価格上昇 → 新規ロング参入（強気）';
  } else if (!oiIncreasing && priceChange > 0) {
    oiPriceSignal = 'short_cover';
    oiPriceDescription = 'OI減少 + 価格上昇 → ショートカバー主体（上昇持続力は弱い可能性）';
  } else if (oiIncreasing && priceChange < 0) {
    oiPriceSignal = 'new_shorts';
    oiPriceDescription = 'OI増加 + 価格下落 → 新規ショート参入（弱気）';
  } else if (!oiIncreasing && priceChange < 0) {
    oiPriceSignal = 'long_liquidation';
    oiPriceDescription = 'OI減少 + 価格下落 → ロング清算';
  } else {
    oiPriceDescription = '方向性なし';
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
  };
}
