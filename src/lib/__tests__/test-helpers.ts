import { OHLCV } from '../types';

/**
 * 下降トレンド + 戻りのキャンドルデータを生成
 */
export function generateDowntrendWithBounce(params: {
  high: number;
  low: number;
  currentPrice: number;
  timeframe: string;
  candleCount: number;
}): OHLCV[] {
  const { high, low, currentPrice, candleCount } = params;
  const candles: OHLCV[] = [];

  // 前半70%: high から low へ下降
  const downCount = Math.floor(candleCount * 0.7);
  // 後半30%: low から currentPrice へ反発
  const bounceCount = candleCount - downCount;

  const now = Date.now();
  const intervalMs = getIntervalMs(params.timeframe);

  // 下降フェーズ
  for (let i = 0; i < downCount; i++) {
    const progress = i / downCount;
    const midPrice = high - (high - low) * progress;
    const noise = (high - low) * 0.005;
    const close = midPrice - noise * (i % 2 === 0 ? 1 : -0.5); // 下降バイアス
    const open = close + (high - low) * 0.003;
    candles.push({
      time: now - (candleCount - i) * intervalMs,
      open,
      high: Math.max(open, close) + noise * 0.3,
      low: Math.min(open, close) - noise * 0.3,
      close,
      volume: 100 + (i % 3) * 50,
    });
  }

  // 反発フェーズ
  for (let i = 0; i < bounceCount; i++) {
    const progress = i / bounceCount;
    const midPrice = low + (currentPrice - low) * progress;
    const noise = (high - low) * 0.003;
    const close = midPrice + noise * (i % 2 === 0 ? 0.5 : -0.3);
    const open = close - (currentPrice - low) * 0.002;
    candles.push({
      time: now - (bounceCount - i) * intervalMs,
      open,
      high: Math.max(open, close) + noise * 0.3,
      low: Math.min(open, close) - noise * 0.3,
      close,
      volume: 100 + (i % 3) * 50,
    });
  }

  return candles;
}

/**
 * トレンド反転のキャンドルデータを生成
 * 前半: previousHigh → previousLow（下降）
 * 後半: previousLow → currentPrice（V字回復）
 */
export function generateTrendReversal(params: {
  previousHigh: number;
  previousLow: number;
  currentPrice: number;
  timeframe: string;
  candleCount: number;
}): OHLCV[] {
  const { previousHigh, previousLow, currentPrice, candleCount } = params;
  const candles: OHLCV[] = [];
  const half = Math.floor(candleCount / 2);
  const intervalMs = getIntervalMs(params.timeframe);
  const now = Date.now();
  const range = previousHigh - previousLow;

  // 下降フェーズ
  for (let i = 0; i < half; i++) {
    const progress = i / half;
    const close = previousHigh - range * progress;
    const noise = range * 0.005;
    candles.push(makeCandle(now - (candleCount - i) * intervalMs, close, noise));
  }

  // 反転上昇フェーズ
  const remaining = candleCount - half;
  for (let i = 0; i < remaining; i++) {
    const progress = i / remaining;
    const close = previousLow + (currentPrice - previousLow) * progress;
    const noise = range * 0.005;
    candles.push(makeCandle(now - (remaining - i) * intervalMs, close, noise));
  }

  return candles;
}

/**
 * トレンド継続（安値更新）のキャンドルデータを生成
 * Phase1: previousHigh → previousLow（下降）
 * Phase2: previousLow → bounceHigh（反発）
 * Phase3: bounceHigh → currentPrice（再下落、安値更新）
 */
export function generateTrendContinuation(params: {
  previousHigh: number;
  previousLow: number;
  bounceHigh: number;
  currentPrice: number;
  timeframe: string;
  candleCount: number;
}): OHLCV[] {
  const { previousHigh, previousLow, bounceHigh, currentPrice, candleCount } = params;
  const candles: OHLCV[] = [];
  const third = Math.floor(candleCount / 3);
  const intervalMs = getIntervalMs(params.timeframe);
  const now = Date.now();

  // Phase 1: 下降 previousHigh → previousLow
  for (let i = 0; i < third; i++) {
    const progress = i / third;
    const close = previousHigh - (previousHigh - previousLow) * progress;
    const noise = (previousHigh - previousLow) * 0.005;
    candles.push(makeCandle(now - (candleCount - i) * intervalMs, close, noise));
  }

  // Phase 2: 反発 previousLow → bounceHigh
  for (let i = 0; i < third; i++) {
    const progress = i / third;
    const close = previousLow + (bounceHigh - previousLow) * progress;
    const noise = (bounceHigh - previousLow) * 0.005;
    candles.push(makeCandle(now - (candleCount - third - i) * intervalMs, close, noise));
  }

  // Phase 3: 再下落 bounceHigh → currentPrice（安値更新）
  const remaining = candleCount - third * 2;
  for (let i = 0; i < remaining; i++) {
    const progress = i / remaining;
    const close = bounceHigh - (bounceHigh - currentPrice) * progress;
    const noise = (bounceHigh - currentPrice) * 0.005;
    candles.push(makeCandle(now - (remaining - i) * intervalMs, close, noise));
  }

  return candles;
}

/**
 * レンジ相場のキャンドルデータを生成
 */
export function generateRangeBound(params: {
  rangeHigh: number;
  rangeLow: number;
  currentPrice: number;
  timeframe: string;
  candleCount: number;
}): OHLCV[] {
  const { rangeHigh, rangeLow, currentPrice, candleCount } = params;
  const candles: OHLCV[] = [];
  const intervalMs = getIntervalMs(params.timeframe);
  const now = Date.now();
  const mid = (rangeHigh + rangeLow) / 2;
  const amp = (rangeHigh - rangeLow) / 2;

  for (let i = 0; i < candleCount; i++) {
    const progress = i / candleCount;
    const phase = Math.sin(progress * Math.PI * 4); // 2往復
    const basePrice = i === candleCount - 1 ? currentPrice : mid + amp * 0.7 * phase;
    const noise = amp * 0.05;
    candles.push(makeCandle(now - (candleCount - i) * intervalMs, basePrice, noise));
  }

  return candles;
}

// ---- ユーティリティ ----

function makeCandle(time: number, close: number, noise: number): OHLCV {
  const open = close + (noise * 0.3); // slight offset
  return {
    time,
    open,
    high: Math.max(open, close) + noise * 0.5,
    low: Math.min(open, close) - noise * 0.5,
    close,
    volume: 150,
  };
}

function getIntervalMs(timeframe: string): number {
  const map: Record<string, number> = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return map[timeframe] ?? 60 * 60 * 1000;
}
