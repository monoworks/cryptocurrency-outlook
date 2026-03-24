/**
 * 4Hトレンド判定の診断スクリプト
 * 実データをHyperliquid APIから取得し、analyzeTrend()の中間値を全て出力する。
 *
 * 使い方: npx tsx scripts/diagnose-trend.ts
 */

import { OHLCV, Timeframe } from '../src/lib/types';
import { calcIndicators } from '../src/lib/indicators';
import { analyzeTrend } from '../src/lib/trend';

const INFO_URL = 'https://api.hyperliquid.xyz/info';

async function fetchCandles(coin: string, interval: Timeframe, limit = 200): Promise<OHLCV[]> {
  const intervalMs: Record<string, number> = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  const endTime = Date.now();
  const startTime = endTime - intervalMs[interval]! * limit;

  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const data = await res.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>;
  return data.map((c) => ({
    time: c.t,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

// RANGE_LOOKBACK (must match src/lib/trend.ts)
const RANGE_LOOKBACK: Record<Timeframe, number> = {
  '5m': 48,
  '15m': 32,
  '1h': 48,
  '4h': 60,
  '1d': 30,
};

// SWING_LOOKBACK (must match src/lib/trend.ts)
const SWING_LOOKBACK: Record<Timeframe, number> = {
  '5m': 5,
  '15m': 5,
  '1h': 8,
  '4h': 10,
  '1d': 10,
};

const MIN_SWING_AMPLITUDE: Record<Timeframe, number> = {
  '5m': 0.003,
  '15m': 0.005,
  '1h': 0.01,
  '4h': 0.02,
  '1d': 0.03,
};

function detectSwingsDebug(candles: OHLCV[], lookback: number, timeframe: Timeframe) {
  const minAmplitude = MIN_SWING_AMPLITUDE[timeframe] ?? 0.01;
  const rawHighs: { price: number; index: number; time: string }[] = [];
  const rawLows: { price: number; index: number; time: string }[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) rawHighs.push({ price: candles[i].high, index: i, time: new Date(candles[i].time).toISOString() });
    if (isLow) rawLows.push({ price: candles[i].low, index: i, time: new Date(candles[i].time).toISOString() });
  }

  // 振幅フィルタ
  const filteredHighs: typeof rawHighs = [];
  for (const h of rawHighs) {
    if (filteredHighs.length === 0 || Math.abs(h.price - filteredHighs[filteredHighs.length - 1].price) / filteredHighs[filteredHighs.length - 1].price >= minAmplitude) {
      filteredHighs.push(h);
    }
  }
  const filteredLows: typeof rawLows = [];
  for (const l of rawLows) {
    if (filteredLows.length === 0 || Math.abs(l.price - filteredLows[filteredLows.length - 1].price) / filteredLows[filteredLows.length - 1].price >= minAmplitude) {
      filteredLows.push(l);
    }
  }

  return { rawHighs, rawLows, filteredHighs, filteredLows };
}

async function diagnose(coin: string, timeframe: Timeframe) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`診断: ${coin} ${timeframe}`);
  console.log('='.repeat(80));

  const candles = await fetchCandles(coin, timeframe);
  console.log(`\nキャンドル数: ${candles.length}`);
  console.log(`期間: ${new Date(candles[0].time).toISOString()} → ${new Date(candles[candles.length - 1].time).toISOString()}`);
  console.log(`現在値: $${candles[candles.length - 1].close.toLocaleString()}`);

  // インジケーター
  const indicators = calcIndicators(candles);
  console.log(`\n--- MA ---`);
  console.log(`EMA20: ${indicators.ema20?.toFixed(2) ?? 'null'}`);
  console.log(`EMA50: ${indicators.ema50?.toFixed(2) ?? 'null'}`);
  console.log(`SMA200: ${indicators.sma200?.toFixed(2) ?? 'null'}`);

  let maScore = 0;
  if (indicators.ema20 != null && indicators.ema50 != null) {
    if (indicators.ema20 > indicators.ema50) maScore += 1;
    else maScore -= 1;
  }
  if (indicators.ema50 != null && indicators.sma200 != null) {
    if (indicators.ema50 > indicators.sma200) maScore += 1;
    else maScore -= 1;
  }
  console.log(`MA Score: ${maScore}`);

  console.log(`\n--- ADX ---`);
  console.log(`ADX: ${indicators.adx?.toFixed(2) ?? 'null'}`);
  console.log(`RSI: ${indicators.rsi?.toFixed(2) ?? 'null'}`);

  // スイングハイ/ロー検出
  const swingLookback = SWING_LOOKBACK[timeframe];
  const swings = detectSwingsDebug(candles, swingLookback, timeframe);
  console.log(`\n--- スイングハイ/ロー ---`);
  console.log(`Lookback: ${swingLookback}本, Min Amplitude: ${MIN_SWING_AMPLITUDE[timeframe] * 100}%`);
  console.log(`Raw Highs (${swings.rawHighs.length}件): ${swings.rawHighs.map(h => `$${h.price.toFixed(0)}@${h.time.slice(5,16)}`).join(', ')}`);
  console.log(`Raw Lows (${swings.rawLows.length}件): ${swings.rawLows.map(l => `$${l.price.toFixed(0)}@${l.time.slice(5,16)}`).join(', ')}`);
  console.log(`Filtered Highs (${swings.filteredHighs.length}件): ${swings.filteredHighs.map(h => `$${h.price.toFixed(0)}@${h.time.slice(5,16)}`).join(', ')}`);
  console.log(`Filtered Lows (${swings.filteredLows.length}件): ${swings.filteredLows.map(l => `$${l.price.toFixed(0)}@${l.time.slice(5,16)}`).join(', ')}`);

  const recentHighs = swings.filteredHighs.map(h => h.price).slice(-3);
  const recentLows = swings.filteredLows.map(l => l.price).slice(-3);
  console.log(`\nRecent Highs (直近3): ${recentHighs.map(h => `$${h.toFixed(0)}`).join(', ')}`);
  console.log(`Recent Lows (直近3): ${recentLows.map(l => `$${l.toFixed(0)}`).join(', ')}`);

  const higherHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1] > recentHighs[recentHighs.length - 2];
  const higherLows = recentHighs.length >= 2 && recentLows[recentLows.length - 1] > recentLows[recentLows.length - 2];
  const lowerHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1] < recentHighs[recentHighs.length - 2];
  const lowerLows = recentLows.length >= 2 && recentLows[recentLows.length - 1] < recentLows[recentLows.length - 2];
  console.log(`HH: ${higherHighs}, HL: ${higherLows}, LH: ${lowerHighs}, LL: ${lowerLows}`);

  // HH/HL + MA によるトレンド判定
  let hhhlDirection = 'range';
  if ((higherHighs && higherLows) || maScore >= 2) hhhlDirection = 'uptrend';
  else if ((lowerHighs && lowerLows) || maScore <= -2) hhhlDirection = 'downtrend';
  else if (maScore > 0 && (higherHighs || higherLows)) hhhlDirection = 'uptrend';
  else if (maScore < 0 && (lowerHighs || lowerLows)) hhhlDirection = 'downtrend';
  console.log(`\nHH/HL + MA判定: ${hhhlDirection}`);

  // レンジベースバイアス
  const rangeLookbackCount = RANGE_LOOKBACK[timeframe];
  const lookbackCandles = candles.slice(-rangeLookbackCount);
  const rangeHigh = Math.max(...lookbackCandles.map(c => c.high));
  const rangeLow = Math.min(...lookbackCandles.map(c => c.low));
  const rangePercent = (rangeHigh - rangeLow) / rangeHigh * 100;
  const currentPrice = candles[candles.length - 1].close;
  const pricePositionInRange = (currentPrice - rangeLow) / (rangeHigh - rangeLow);

  console.log(`\n--- レンジベースバイアス ---`);
  console.log(`Lookback: ${rangeLookbackCount}本 (${lookbackCandles.length}本利用可能)`);
  console.log(`Lookback期間: ${new Date(lookbackCandles[0].time).toISOString()} → ${new Date(lookbackCandles[lookbackCandles.length - 1].time).toISOString()}`);
  console.log(`Range High: $${rangeHigh.toFixed(0)}`);
  console.log(`Range Low: $${rangeLow.toFixed(0)}`);
  console.log(`Range %: ${rangePercent.toFixed(2)}%`);
  console.log(`Price Position: ${pricePositionInRange.toFixed(3)} (0=底, 1=天井)`);

  let rangeBasedBias = 'neutral';
  if (rangePercent >= 5) {
    if (pricePositionInRange < 0.35) rangeBasedBias = 'downtrend';
    else if (pricePositionInRange > 0.65) rangeBasedBias = 'uptrend';
  }
  console.log(`Range-Based Bias: ${rangeBasedBias} (閾値: rangePercent>=5 → ${rangePercent >= 5}, pos<0.35 → ${pricePositionInRange < 0.35}, pos>0.65 → ${pricePositionInRange > 0.65})`);

  // オーバーライド判定
  let finalDirection = hhhlDirection;
  if (rangeBasedBias !== 'neutral') {
    if (hhhlDirection === 'range') {
      finalDirection = rangeBasedBias;
      console.log(`→ HH/HL不明確のためrangeBasedBias採用: ${rangeBasedBias}`);
    } else if (hhhlDirection !== rangeBasedBias && rangePercent >= 8) {
      finalDirection = rangeBasedBias;
      console.log(`→ HH/HL(${hhhlDirection})と矛盾 + range${rangePercent.toFixed(1)}%>=8% → オーバーライド: ${rangeBasedBias}`);
    } else if (hhhlDirection !== rangeBasedBias) {
      console.log(`→ HH/HL(${hhhlDirection})と矛盾するがrange${rangePercent.toFixed(1)}%<8%のためオーバーライドなし`);
    } else {
      console.log(`→ HH/HLとrangeBasedBiasが一致: ${rangeBasedBias}`);
    }
  }

  console.log(`\n★ 最終判定: ${finalDirection}`);

  // 実際の analyzeTrend() の結果と比較
  const actual = analyzeTrend(candles, indicators, timeframe);
  console.log(`\n★ analyzeTrend() 実際の出力:`);
  console.log(`  direction: ${actual.direction}`);
  console.log(`  strength: ${actual.strength}`);
  console.log(`  higherHighs: ${actual.higherHighs}`);
  console.log(`  higherLows: ${actual.higherLows}`);
  console.log(`  maAlignment: ${actual.maAlignment}`);

  if (actual.direction !== finalDirection) {
    console.log(`\n⚠ 診断の予測(${finalDirection})と実際の出力(${actual.direction})が不一致！`);
  }
}

async function main() {
  const timeframes: Timeframe[] = ['4h', '1h', '15m', '5m'];
  for (const tf of timeframes) {
    await diagnose('BTC', tf);
  }
}

main().catch(console.error);
