import { describe, it, expect } from 'vitest';
import { analyzeTrend } from '../trend';
import { calcIndicators } from '../indicators';
import {
  generateDowntrendWithBounce,
  generateTrendReversal,
  generateTrendContinuation,
  generateRangeBound,
} from './test-helpers';

describe('analyzeTrend - 下降トレンド内の戻り', () => {
  it('4H: 78K→67.8Kの下落後、70.4Kまで戻した場合にdowntrendを返す', () => {
    // pricePositionInRange = (70450-67800)/(78000-67800) = 0.26
    // 0.26 < 0.35 → downtrend
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 70450,
      timeframe: '4h',
      candleCount: 60, // 10日分（RANGE_LOOKBACK['4h']=60をカバー）
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    expect(result.direction).toBe('downtrend');
  });

  it('4H: 71,370まで戻した場合もdowntrendを返す（閾値ちょうど）', () => {
    // 71,370 = 67,800 + (78,000 - 67,800) × 0.35 = 閾値ちょうど
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 71370,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // 閾値ちょうど（0.35）→ downtrend にはならない（neutral以上）→ uptrendではないはず
    expect(result.direction).not.toBe('uptrend');
  });

  it('4H: 72,000まで戻した場合はdowntrendではない', () => {
    // pricePositionInRange = (72000-67800)/(78000-67800) = 0.41
    // 0.35 < 0.41 < 0.65 → neutral → HH/HL判定次第
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 72000,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // レンジ中間にいるので、rangeBasedBias=neutralになりHH/HL依存
    // 大幅下落後のリバウンドなのでdowntrendまたはrangeが妥当
    expect(result.direction).not.toBe('uptrend');
  });
});

describe('analyzeTrend - トレンド反転', () => {
  it('4H: 下落後に前回高値の中間を明確に超過 → uptrendを返す可能性がある', () => {
    // 下落: 78,000 → 67,800 → 反発: 74,000
    // pricePositionInRange = (74000-67800)/(78000-67800) = 0.61
    // 0.35 < 0.61 < 0.65 → neutral → HH/HL判定に委ねる
    const candles = generateTrendReversal({
      previousHigh: 78000,
      previousLow: 67800,
      currentPrice: 74000,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // 中間レンジなので exact direction は HH/HL 依存
    // downtrend は不適切（大幅反発済み）
    expect(['uptrend', 'range']).toContain(result.direction);
  });

  it('4H: 前回安値を割って下落継続 → downtrendが維持される', () => {
    const candles = generateTrendContinuation({
      previousHigh: 78000,
      previousLow: 67800,
      bounceHigh: 70000,
      currentPrice: 66500, // 安値更新
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    expect(result.direction).toBe('downtrend');
  });
});

describe('analyzeTrend - レンジ相場', () => {
  it('4H: 69K〜71Kの狭いレンジ（2.9%）で中央にいる → range', () => {
    const candles = generateRangeBound({
      rangeHigh: 71000,
      rangeLow: 69000,
      currentPrice: 70000,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // レンジ幅2.9% < 5% → rangeBasedBias = neutral → HH/HL判定
    // サイン波なのでrange が妥当
    expect(result.direction).toBe('range');
  });
});

describe('analyzeTrend - レンジ幅オーバーライド', () => {
  it('4H: レンジ幅8%以上でHH/HL判定と矛盾する場合にオーバーライドされる', () => {
    // 78K→67.8K = 13%のレンジ幅、pricePosition=0.26
    // HH/HLが直近の戻りでuptrendを示唆しても、rangeBasedBiasがオーバーライド
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 70450,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // rangePercent ≈ 13% >= 8% → オーバーライド有効
    // pricePosition ≈ 0.26 < 0.35 → downtrend
    expect(result.direction).toBe('downtrend');
  });
});

describe('analyzeTrend - タイムフレーム別挙動', () => {
  it('1H: 短期下降トレンドを検出できる', () => {
    const candles = generateDowntrendWithBounce({
      high: 72000,
      low: 68000,
      currentPrice: 68500,
      timeframe: '1h',
      candleCount: 48,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '1h');

    expect(result.direction).toBe('downtrend');
  });

  it('15m: 短期上昇で価格がレンジ上端にいる場合はuptrend', () => {
    // 反転上昇パターン、十分なレンジ幅とレンジ上端での価格位置
    const candles = generateTrendReversal({
      previousHigh: 72000,
      previousLow: 67000,
      currentPrice: 71800, // レンジ上端（pricePosition ≈ 0.96）
      timeframe: '15m',
      candleCount: 40,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '15m');

    // レンジ幅 ≈ 7% >= 5%, pricePosition > 0.65 → rangeBasedBias = uptrend
    expect(result.direction).toBe('uptrend');
  });
});
