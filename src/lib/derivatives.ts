import { MarketData, DerivativesAnalysis, OIPriceSignal, DerivativesHistory, OIChange, FundingTrend, OiResidualAnalysis, PredictedFundingInfo } from './types';

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

/**
 * OI 残存率分析: 価格変動に対する OI の残存率を計算し、ボラティリティ予測に活用
 */
export function analyzeOiResidual(
  currentOi: number,
  prevOi: number,
  currentPrice: number,
  prevPrice: number,
): OiResidualAnalysis {
  const priceMove = ((currentPrice - prevPrice) / prevPrice) * 100;
  const oiChange = ((currentOi - prevOi) / prevOi) * 100;
  const absPriceMove = Math.abs(priceMove);
  const residualRatio = absPriceMove > 0.5
    ? Math.abs(oiChange) / absPriceMove
    : 1.0; // 価格変動が小さい場合は中立

  let status: OiResidualAnalysis['status'];
  let volatilityBias: OiResidualAnalysis['volatilityBias'];
  let description: string;

  if (absPriceMove >= 3 && residualRatio < 0.3) {
    // 大きく動いたのにOIが残っている → ポジション未整理
    status = 'positions_remaining';
    volatilityBias = 'high';
    description = `価格${priceMove.toFixed(1)}%変動に対しOI変化${oiChange.toFixed(1)}%。ポジション未整理で再度の急変動リスクあり。`;
  } else if (absPriceMove >= 3 && residualRatio > 0.7) {
    // 大きく動いてOIも減った → ポジション整理済み
    status = 'positions_cleared';
    volatilityBias = 'low';
    description = `価格${priceMove.toFixed(1)}%変動に対しOI${oiChange.toFixed(1)}%変化。ポジション整理が進み、次の方向待ち。`;
  } else if (oiChange > 5 && absPriceMove < 2) {
    // 価格はあまり動いてないのにOIが増えている → 新規ポジション構築中
    status = 'positions_building';
    volatilityBias = 'high';
    description = `価格安定中にOI${oiChange.toFixed(1)}%増加。新規ポジション構築中で、方向が出たら加速しやすい。`;
  } else {
    status = 'neutral';
    volatilityBias = 'normal';
    description = 'OI残存率に顕著な偏りなし。';
  }

  return { recentPriceMove: priceMove, oiChangeRate: oiChange, residualRatio, status, volatilityBias, description };
}

export function analyzeDerivatives(data: MarketData, history?: DerivativesHistory, predictedFunding?: { hlRate: number | null; binRate: number | null; bybitRate: number | null; nextFundingTime: number }): DerivativesAnalysis {
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

  // OI Residual analysis (24h comparison using OI history)
  let oiResidual: OiResidualAnalysis | undefined;
  if (history && history.oiHistory.length >= 2) {
    const currentOi = history.oiHistory[history.oiHistory.length - 1].oi;
    // Use ~24h ago OI (or earliest available)
    const prevIdx = Math.max(0, history.oiHistory.length - 25); // ~24h of hourly data
    const prevOi = history.oiHistory[prevIdx].oi;
    if (prevOi > 0) {
      oiResidual = analyzeOiResidual(currentOi, prevOi, ticker.lastPrice, ticker.lastPrice / (1 + priceChange / 100));
    }
  }

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

  // Predicted funding analysis
  let predictedFundingInfo: PredictedFundingInfo | undefined;
  if (predictedFunding && predictedFunding.hlRate !== null) {
    const predicted = predictedFunding.hlRate;
    let signal: PredictedFundingInfo['signal'] = 'neutral';
    let description: string | undefined;

    // 予測Fundingが過熱閾値を超えている場合、スクイーズリスクを検出
    // 正のFunding = ロングがショートに支払い → ロング過多 → ロングスクイーズリスク
    // 負のFunding = ショートがロングに支払い → ショート過多 → ショートスクイーズリスク
    if (predicted > 0.0001) {
      signal = 'squeeze_risk_long';
      description = `次回予測Funding: +${(predicted * 100).toFixed(4)}%（ロング過多）。ロングスクイーズリスクに注意。`;
    } else if (predicted < -0.0001) {
      signal = 'squeeze_risk_short';
      description = `次回予測Funding: ${(predicted * 100).toFixed(4)}%（ショート過多）。ショートスクイーズリスクに注意。`;
    }

    // 現在と予測の乖離が大きい場合、さらに警告を強化
    const currentToPredict = Math.abs(predicted - funding);
    if (currentToPredict > 0.0002 && description) {
      description += ` 現在値(${(funding * 100).toFixed(4)}%)から急変動の兆候。`;
    }

    predictedFundingInfo = {
      hlRate: predictedFunding.hlRate,
      binRate: predictedFunding.binRate,
      bybitRate: predictedFunding.bybitRate,
      nextFundingTime: predictedFunding.nextFundingTime,
      signal,
      description,
    };
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
    oiResidual,
    predictedFunding: predictedFundingInfo,
  };
}
