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
