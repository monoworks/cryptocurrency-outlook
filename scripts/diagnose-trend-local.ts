/**
 * 4Hトレンド判定の診断スクリプト（ローカルデータ版）
 * 78K→67.8K→70.4Kの実際のBTCシナリオをシミュレートして
 * analyzeTrend()の中間値を全て出力する。
 *
 * 使い方: npx tsx scripts/diagnose-trend-local.ts
 */

import { OHLCV, Timeframe } from '../src/lib/types';
import { calcIndicators } from '../src/lib/indicators';
import { analyzeTrend } from '../src/lib/trend';

/**
 * BTC 4H足の現実的なデータを手動生成
 * 3/10〜3/24の約15日間（90本）
 * 3/10-3/16: 72K→78K上昇
 * 3/17: 78K（天井）
 * 3/17-3/23: 78K→67.8K下落
 * 3/23-3/24: 67.8K→70.4Kリバウンド
 */
function generateRealisticBTCCandles(): OHLCV[] {
  const candles: OHLCV[] = [];
  const fourHoursMs = 4 * 60 * 60 * 1000;
  // Start from March 10, 2026 00:00 UTC
  const startTime = new Date('2026-03-10T00:00:00Z').getTime();

  // Price path: array of [close, high_offset, low_offset]
  // Phase 1: 3/10-3/16 上昇 (72K→78K, ~36本)
  const phase1Count = 36;
  for (let i = 0; i < phase1Count; i++) {
    const progress = i / phase1Count;
    const close = 72000 + 6000 * progress + (i % 3 - 1) * 100;
    const high = close + 200 + (i % 2) * 150;
    const low = close - 200 - (i % 3) * 100;
    const open = close - 50 + (i % 2) * 100;
    candles.push({
      time: startTime + i * fourHoursMs,
      open, high, low, close,
      volume: 200 + (i % 5) * 30,
    });
  }

  // Phase 2: 3/17 天井付近 (78K、3本)
  const phase2Start = candles.length;
  const peakPrices = [77800, 78000, 77500];
  for (let i = 0; i < peakPrices.length; i++) {
    const close = peakPrices[i];
    candles.push({
      time: startTime + (phase2Start + i) * fourHoursMs,
      open: close + 200,
      high: i === 1 ? 78200 : close + 300,
      low: close - 300,
      close,
      volume: 350,
    });
  }

  // Phase 3: 3/17-3/23 下落 (78K→67.8K, ~36本)
  const phase3Start = candles.length;
  const phase3Count = 36;
  for (let i = 0; i < phase3Count; i++) {
    const progress = i / phase3Count;
    const close = 77500 - 9700 * progress + (i % 3 - 1) * 80;
    const high = close + 250 + (i % 2) * 100;
    const low = close - 250 - (i % 3) * 80;
    const open = close + 100 + (i % 2) * 50;
    candles.push({
      time: startTime + (phase3Start + i) * fourHoursMs,
      open, high, low, close,
      volume: 300 + (i % 4) * 50,
    });
  }

  // Phase 4: 3/23-3/24 リバウンド (67.8K→70.4K, ~6本)
  const phase4Start = candles.length;
  const phase4Count = 6;
  for (let i = 0; i < phase4Count; i++) {
    const progress = i / phase4Count;
    const close = 67800 + 2650 * progress + (i % 2) * 50;
    const high = close + 150 + (i % 2) * 100;
    const low = close - 150 - (i % 2) * 50;
    const open = close - 80 + (i % 2) * 30;
    candles.push({
      time: startTime + (phase4Start + i) * fourHoursMs,
      open, high, low, close,
      volume: 250 + (i % 3) * 40,
    });
  }

  // 最後のキャンドルを70,450に設定
  const last = candles[candles.length - 1];
  last.close = 70450;
  last.high = Math.max(last.high, 70450);

  return candles;
}

function diagnose(candles: OHLCV[], timeframe: Timeframe, label: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`診断: ${label} (${timeframe}, ${candles.length}本)`);
  console.log('='.repeat(80));

  console.log(`期間: ${new Date(candles[0].time).toISOString()} → ${new Date(candles[candles.length - 1].time).toISOString()}`);
  console.log(`現在値: $${candles[candles.length - 1].close.toLocaleString()}`);

  const indicators = calcIndicators(candles);
  console.log(`\n--- MA ---`);
  console.log(`EMA20: ${indicators.ema20?.toFixed(2) ?? 'null'}`);
  console.log(`EMA50: ${indicators.ema50?.toFixed(2) ?? 'null'}`);
  console.log(`SMA200: ${indicators.sma200?.toFixed(2) ?? 'null'}`);

  let maScore = 0;
  let maAlignment = '';
  if (indicators.ema20 != null && indicators.ema50 != null) {
    if (indicators.ema20 > indicators.ema50) { maScore += 1; maAlignment = 'EMA20 > EMA50'; }
    else { maScore -= 1; maAlignment = 'EMA20 < EMA50'; }
  }
  if (indicators.ema50 != null && indicators.sma200 != null) {
    if (indicators.ema50 > indicators.sma200) { maScore += 1; maAlignment += ' > SMA200'; }
    else { maScore -= 1; maAlignment += ' < SMA200'; }
  }
  console.log(`MA Score: ${maScore} (${maAlignment})`);
  console.log(`ADX: ${indicators.adx?.toFixed(2) ?? 'null'}`);
  console.log(`RSI: ${indicators.rsi?.toFixed(2) ?? 'null'}`);

  // analyzeTrend() 実行
  const result = analyzeTrend(candles, indicators, timeframe);

  console.log(`\n★ analyzeTrend() 出力:`);
  console.log(`  direction: ${result.direction}`);
  console.log(`  strength: ${result.strength}`);
  console.log(`  higherHighs: ${result.higherHighs}`);
  console.log(`  higherLows: ${result.higherLows}`);
  console.log(`  maAlignment: ${result.maAlignment}`);

  return result;
}

// ======== メイン ========
console.log('BTC 4H トレンド判定 診断レポート');
console.log(`実行日時: ${new Date().toISOString()}`);
console.log('シナリオ: 3/10 72K → 3/17 78K → 3/23 67.8K → 3/24 70.4K');

const candles = generateRealisticBTCCandles();

// 全期間で診断
const result4h = diagnose(candles, '4h', 'BTC 4H (全81本)');

// RANGE_LOOKBACK=60本のみ使った場合
const last60 = candles.slice(-60);
diagnose(last60, '4h', 'BTC 4H (直近60本のみ)');

// 旧設定（30本）での挙動を検証
const last30 = candles.slice(-30);
const result4h_old = diagnose(last30, '4h', 'BTC 4H (旧設定 直近30本 = SWING_LOOKBACK*3)');

console.log(`\n${'='.repeat(80)}`);
console.log('比較結果');
console.log('='.repeat(80));
console.log(`全期間(81本)の判定: ${result4h.direction}`);
console.log(`旧設定(30本)の判定: ${result4h_old.direction}`);

if (result4h.direction === 'downtrend') {
  console.log('\n✅ 修正後は正しく downtrend を判定');
} else {
  console.log(`\n❌ まだ問題あり: ${result4h.direction} (期待: downtrend)`);
}

if (result4h_old.direction !== 'downtrend') {
  console.log(`✅ 旧設定では ${result4h_old.direction} を返す = ルックバック不足が原因だったことを確認`);
}
