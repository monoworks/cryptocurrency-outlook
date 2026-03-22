// src/lib/crowd-psychology.ts

import { DerivativesAnalysis } from './types';

export interface CrowdPsychologySignal {
  pattern: 'short_squeeze_risk' | 'long_squeeze_risk' | 'fomo_buying' | 'panic_selling' | 'neutral';
  intensity: 'low' | 'medium' | 'high';
  description: string;
  /** 正の値 = 強気方向の調整、負の値 = 弱気方向の調整 */
  biasAdjustment: number;
}

export function analyzeCrowdPsychology(
  derivatives: DerivativesAnalysis,
  fearGreedIndex?: number,
): CrowdPsychologySignal {

  const {
    fundingBias,
    premium,
    oiPriceSignal,
    fundingTrend,
    oiChange,
  } = derivatives;

  // === パターン1: ショートスクイーズリスク ===
  // 条件: Funding負（ショート支払い）+ Premium負 + OI高止まりor増加
  const fundingNegative = fundingBias === 'short_heavy';
  const premiumNegative = premium < -0.0003;
  const oiNotDecreasing = !oiChange || oiChange.direction !== 'decreasing';

  if (fundingNegative && premiumNegative && oiNotDecreasing) {
    const isOverheated = fundingTrend?.isOverheated ?? false;
    return {
      pattern: 'short_squeeze_risk',
      intensity: isOverheated ? 'high' : 'medium',
      description: `ショートスクイーズリスク: Funding負(${fundingBias}) + Premium負(${(premium * 100).toFixed(3)}%) + OI維持。ショートポジションが溜まっており、急激な買い戻しが発生する可能性。`,
      biasAdjustment: isOverheated ? 1.0 : 0.5,
    };
  }

  // === パターン2: ロングスクイーズリスク ===
  // 条件: Funding正（ロング支払い）+ Premium正 + OI高止まりor増加
  const fundingPositive = fundingBias === 'long_heavy';
  const premiumPositive = premium > 0.0003;

  if (fundingPositive && premiumPositive && oiNotDecreasing) {
    const isOverheated = fundingTrend?.isOverheated ?? false;
    return {
      pattern: 'long_squeeze_risk',
      intensity: isOverheated ? 'high' : 'medium',
      description: `ロングスクイーズリスク: Funding正(${fundingBias}) + Premium正(${(premium * 100).toFixed(3)}%) + OI維持。ロングポジションが溜まっており、急落リスクあり。`,
      biasAdjustment: isOverheated ? -1.0 : -0.5,
    };
  }

  // === パターン3: FOMO買い ===
  // 条件: Fear & Greed が Extreme Greed(75+) + OI急増 + 新規ロング
  if (
    fearGreedIndex &&
    fearGreedIndex >= 75 &&
    oiChange?.direction === 'increasing' &&
    oiPriceSignal === 'new_longs'
  ) {
    return {
      pattern: 'fomo_buying',
      intensity: fearGreedIndex >= 85 ? 'high' : 'medium',
      description: `FOMO買い検出: Fear&Greed ${fearGreedIndex} + OI急増 + 新規ロング。過熱感あり、反転に注意。`,
      biasAdjustment: -0.5,
    };
  }

  // === パターン4: パニック売り ===
  // 条件: Fear & Greed が Extreme Fear(25-) + OI急増 + 新規ショート
  if (
    fearGreedIndex &&
    fearGreedIndex <= 25 &&
    oiChange?.direction === 'increasing' &&
    oiPriceSignal === 'new_shorts'
  ) {
    return {
      pattern: 'panic_selling',
      intensity: fearGreedIndex <= 15 ? 'high' : 'medium',
      description: `パニック売り検出: Fear&Greed ${fearGreedIndex} + OI急増 + 新規ショート。底打ちの可能性に注意。`,
      biasAdjustment: 0.5,
    };
  }

  return {
    pattern: 'neutral',
    intensity: 'low',
    description: '群集心理に顕著な偏りなし。',
    biasAdjustment: 0,
  };
}
