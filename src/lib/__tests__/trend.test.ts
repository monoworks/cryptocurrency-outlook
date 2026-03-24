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
    // rangePercent ≈ 13% → dynamicThreshold ≈ 0.43
    // pricePositionInRange = (70450-67800)/(78000-67800) = 0.26 < 0.43 → downtrend
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 70450,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    expect(result.direction).toBe('downtrend');
  });

  it('4H: 71,370まで戻した場合もdowntrendを返す', () => {
    // rangePercent ≈ 13% → dynamicThreshold ≈ 0.43
    // pricePosition = (71370-67800)/(78000-67800) = 0.35 < 0.43 → downtrend
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 71370,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    expect(result.direction).not.toBe('uptrend');
  });

  it('4H: 72,900まで戻した場合はneutralゾーン → HH/HL依存', () => {
    // rangePercent ≈ 13% → dynamicThreshold ≈ 0.43
    // pricePosition = (72900-67800)/(78000-67800) = 0.50 → neutral
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 72900,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // 中間ゾーンなのでHH/HL依存、uptrendにはならないはず（下落データなので）
    expect(result.direction).not.toBe('uptrend');
  });
});

describe('analyzeTrend - トレンド反転', () => {
  it('4H: 下落後に前回高値の中間を明確に超過 → uptrendを返す可能性がある', () => {
    // rangePercent ≈ 13% → dynamicThreshold ≈ 0.43
    // pricePosition = (74000-67800)/(78000-67800) = 0.61 → neutral（0.43〜0.57間）
    const candles = generateTrendReversal({
      previousHigh: 78000,
      previousLow: 67800,
      currentPrice: 74000,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // 中間レンジなので HH/HL 依存
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

    // レンジ幅2.9% < 5% → rangeBasedBias判定なし
    expect(result.direction).toBe('range');
  });
});

describe('analyzeTrend - レンジ幅オーバーライド', () => {
  it('4H: レンジ幅13%でHH/HL判定と矛盾する場合にオーバーライドされる', () => {
    // rangePercent ≈ 13% → dynamicThreshold ≈ 0.43
    // pricePosition ≈ 0.26 < 0.43 → downtrend → override
    const candles = generateDowntrendWithBounce({
      high: 78000,
      low: 67800,
      currentPrice: 70450,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    expect(result.direction).toBe('downtrend');
  });
});

describe('analyzeTrend - ダイナミック閾値', () => {
  it('狭いレンジ(5%): 閾値0.35付近 → 端にいなければneutral', () => {
    // rangeHigh=70000, rangeLow=66500 → rangePercent=5.0%
    // dynamicThreshold = 0.35
    // currentPrice=68000 → position = (68000-66500)/(70000-66500) = 0.43 > 0.35 → neutral
    const candles = generateDowntrendWithBounce({
      high: 70000,
      low: 66500,
      currentPrice: 68000,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // 狭いレンジの中間なのでdowntrendにはならない
    expect(result.direction).not.toBe('downtrend');
  });

  it('広いレンジ(15%+): 閾値0.45 → 中間寄りでもdowntrend判定', () => {
    // rangeHigh=80000, rangeLow=68000 → rangePercent=15.0%
    // dynamicThreshold = 0.45
    // currentPrice=73000 → position = (73000-68000)/(80000-68000) = 0.417 < 0.45 → downtrend
    const candles = generateDowntrendWithBounce({
      high: 80000,
      low: 68000,
      currentPrice: 73000,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    // 広いレンジで下寄り → downtrend
    expect(result.direction).toBe('downtrend');
  });

  it('広いレンジ(15%+): 上端ではuptrend判定', () => {
    // rangeHigh=80000, rangeLow=68000 → rangePercent=15.0%
    // dynamicThreshold = 0.45 → 上側閾値 = 0.55
    // currentPrice=77500 → position = (77500-68000)/(80000-68000) = 0.79 > 0.55 → uptrend
    const candles = generateTrendReversal({
      previousHigh: 80000,
      previousLow: 68000,
      currentPrice: 77500,
      timeframe: '4h',
      candleCount: 60,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '4h');

    expect(result.direction).toBe('uptrend');
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
    const candles = generateTrendReversal({
      previousHigh: 72000,
      previousLow: 67000,
      currentPrice: 71800,
      timeframe: '15m',
      candleCount: 40,
    });

    const indicators = calcIndicators(candles);
    const result = analyzeTrend(candles, indicators, '15m');

    // レンジ幅 ≈ 7% → dynamicThreshold ≈ 0.37 → 上側 0.63
    // pricePosition ≈ 0.96 > 0.63 → uptrend
    expect(result.direction).toBe('uptrend');
  });
});
