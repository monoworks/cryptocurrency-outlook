import { RSI, MACD, SMA, EMA, BollingerBands, ADX, StochasticRSI, ATR } from 'technicalindicators';
import { OHLCV, IndicatorValues } from './types';

export function calcIndicators(candles: OHLCV[]): IndicatorValues {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  // RSI
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

  // MACD
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdLatest = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;
  const macd = macdLatest && macdLatest.MACD != null && macdLatest.signal != null && macdLatest.histogram != null
    ? { macd: macdLatest.MACD, signal: macdLatest.signal, histogram: macdLatest.histogram }
    : null;

  // SMA
  const sma20Arr = SMA.calculate({ values: closes, period: 20 });
  const sma50Arr = SMA.calculate({ values: closes, period: 50 });
  const sma200Arr = SMA.calculate({ values: closes, period: 200 });
  const sma20 = sma20Arr.length > 0 ? sma20Arr[sma20Arr.length - 1] : null;
  const sma50 = sma50Arr.length > 0 ? sma50Arr[sma50Arr.length - 1] : null;
  const sma200 = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1] : null;

  // EMA
  const ema20Arr = EMA.calculate({ values: closes, period: 20 });
  const ema50Arr = EMA.calculate({ values: closes, period: 50 });
  const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : null;
  const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : null;

  // VWAP (simple cumulative for the session)
  let vwap: number | null = null;
  if (closes.length > 0) {
    let cumVol = 0;
    let cumTP = 0;
    for (let i = 0; i < closes.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      cumVol += volumes[i];
      cumTP += tp * volumes[i];
    }
    vwap = cumVol > 0 ? cumTP / cumVol : null;
  }

  // Bollinger Bands
  const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const bbLatest = bbValues.length > 0 ? bbValues[bbValues.length - 1] : null;
  const bollingerBands = bbLatest
    ? { upper: bbLatest.upper, middle: bbLatest.middle, lower: bbLatest.lower }
    : null;

  // ADX
  const adxValues = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const adx = adxValues.length > 0 ? adxValues[adxValues.length - 1].adx : null;

  // Stochastic RSI
  let stochRsi: { k: number; d: number } | null = null;
  if (closes.length >= 20) {
    const stochRsiValues = StochasticRSI.calculate({
      values: closes,
      rsiPeriod: 14,
      stochasticPeriod: 14,
      kPeriod: 3,
      dPeriod: 3,
    });
    const stochLatest = stochRsiValues.length > 0 ? stochRsiValues[stochRsiValues.length - 1] : null;
    if (stochLatest && stochLatest.k != null && stochLatest.d != null) {
      stochRsi = { k: stochLatest.k, d: stochLatest.d };
    }
  }

  // ATR
  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;

  return { rsi, stochRsi, macd, sma20, sma50, sma200, ema20, ema50, vwap, bollingerBands, adx, atr };
}

/**
 * Calculate Rolling VWAP as a time series.
 * Uses a sliding window of `period` candles instead of cumulative.
 * Returns an array of { time, value, color } suitable for chart LineSeries.
 */
export function calcVwapSeries(
  candles: { time: number; high: number; low: number; close: number; volume: number }[],
  period = 20,
): { time: number; value: number; color: string }[] {
  const result: { time: number; value: number; color: string }[] = [];
  let prevValue = 0;

  for (let i = 0; i < candles.length; i++) {
    // ウィンドウ: 直近 period 本（データが足りなければ先頭から）
    const start = Math.max(0, i - period + 1);
    let windowVol = 0;
    let windowTP = 0;

    for (let j = start; j <= i; j++) {
      const c = candles[j];
      const tp = (c.high + c.low + c.close) / 3;
      windowVol += c.volume;
      windowTP += tp * c.volume;
    }

    if (windowVol > 0) {
      const value = windowTP / windowVol;
      const color = value >= prevValue ? 'rgba(59, 130, 246, 0.9)' : 'rgba(239, 68, 68, 0.9)';
      result.push({ time: candles[i].time, value, color });
      prevValue = value;
    }
  }

  return result;
}

/**
 * Anchored VWAP: 指定されたインデックスからの累積VWAPを算出。
 * アンカーポイント（スイングハイ/ロー）から現在までの出来高加重平均価格を返す。
 */
export function calcAnchoredVwap(
  candles: { high: number; low: number; close: number; volume: number }[],
  anchorIndex: number,
): number | null {
  if (anchorIndex < 0 || anchorIndex >= candles.length) return null;

  let cumVol = 0;
  let cumTP = 0;

  for (let i = anchorIndex; i < candles.length; i++) {
    const c = candles[i];
    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumTP += tp * c.volume;
  }

  return cumVol > 0 ? cumTP / cumVol : null;
}

export interface AnchoredVwapResult {
  /** 直近スイングハイからのVWAP（売り手の平均コスト） */
  fromSwingHigh: number | null;
  swingHighPrice: number | null;
  swingHighIndex: number;
  /** 直近スイングローからのVWAP（買い手の平均コスト） */
  fromSwingLow: number | null;
  swingLowPrice: number | null;
  swingLowIndex: number;
  /** 現在価格 */
  currentPrice: number;
  /** VWAP分析シグナル */
  signal: 'bullish' | 'bearish' | 'neutral';
  /** 説明文 */
  description: string;
}

/**
 * Anchored VWAP分析:
 * 直近のスイングハイ/ローからVWAPを算出し、現在価格との位置関係で判断。
 *
 * - 価格 > 高値VWAP → 強い強気（高値で売った人も含み損）
 * - 価格 > 安値VWAP かつ 価格 < 高値VWAP → やや強気（安値で買った人が含み益）
 * - 価格 < 安値VWAP → 強い弱気（安値で買った人も含み損）
 * - 価格 < 高値VWAP かつ 価格 > 安値VWAP → やや弱気（高値で売った人が含み益）
 */
export function analyzeAnchoredVwap(
  candles: { high: number; low: number; close: number; volume: number }[],
  lookback: number = 50,
): AnchoredVwapResult | null {
  if (candles.length < 10) return null;

  const scope = candles.slice(-lookback);
  const offset = candles.length - scope.length;

  // スイングハイ/ロー検出（簡易版: 期間内の最高値/最安値のインデックス）
  let swingHighIdx = 0;
  let swingLowIdx = 0;
  let maxHigh = -Infinity;
  let minLow = Infinity;

  for (let i = 0; i < scope.length; i++) {
    if (scope[i].high > maxHigh) { maxHigh = scope[i].high; swingHighIdx = i; }
    if (scope[i].low < minLow) { minLow = scope[i].low; swingLowIdx = i; }
  }

  const globalHighIdx = offset + swingHighIdx;
  const globalLowIdx = offset + swingLowIdx;

  const fromSwingHigh = calcAnchoredVwap(candles, globalHighIdx);
  const fromSwingLow = calcAnchoredVwap(candles, globalLowIdx);
  const currentPrice = candles[candles.length - 1].close;

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let description = '';

  if (fromSwingHigh != null && fromSwingLow != null) {
    const aboveHighVwap = currentPrice > fromSwingHigh;
    const aboveLowVwap = currentPrice > fromSwingLow;

    if (aboveHighVwap && aboveLowVwap) {
      signal = 'bullish';
      description = `現在値$${currentPrice.toLocaleString()}は高値VWAP($${Math.round(fromSwingHigh).toLocaleString()})を上回る。高値圏の売り手も含み損 → 買い圧力優勢。`;
    } else if (!aboveHighVwap && aboveLowVwap) {
      // 高値VWAPと安値VWAPの間 → アンカーの時系列で判断
      if (swingHighIdx > swingLowIdx) {
        // 安値→高値→現在（高値から下落中）→ やや弱気
        signal = 'bearish';
        description = `現在値は高値VWAP($${Math.round(fromSwingHigh).toLocaleString()})を下回るが安値VWAP($${Math.round(fromSwingLow).toLocaleString()})は上回る。直近高値からの下落局面 → 戻り売り圧力あり。`;
      } else {
        // 高値→安値→現在（安値から反発中）→ やや強気
        signal = 'bullish';
        description = `現在値は安値VWAP($${Math.round(fromSwingLow).toLocaleString()})を上回り反発中。底値で買った参加者が含み益 → 押し目買い意欲あり。`;
      }
    } else if (!aboveHighVwap && !aboveLowVwap) {
      signal = 'bearish';
      description = `現在値$${currentPrice.toLocaleString()}は安値VWAP($${Math.round(fromSwingLow).toLocaleString()})も下回る。底値で買った参加者も含み損 → 投げ売り圧力リスク。`;
    } else {
      signal = 'neutral';
      description = `VWAP間で方向性が不明確。`;
    }
  } else {
    description = 'Anchored VWAP算出不可（データ不足）。';
  }

  return {
    fromSwingHigh,
    swingHighPrice: maxHigh !== -Infinity ? maxHigh : null,
    swingHighIndex: globalHighIdx,
    fromSwingLow,
    swingLowPrice: minLow !== Infinity ? minLow : null,
    swingLowIndex: globalLowIdx,
    currentPrice,
    signal,
    description,
  };
}
