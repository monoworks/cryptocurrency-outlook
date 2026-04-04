import { NextRequest, NextResponse } from 'next/server';
import { getKlinesWithTakerVolume } from '@/lib/hyperliquid';
import { resolveCoin } from '@/lib/symbol-resolver';
import { notifyPriceAlert } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';

const DEFAULT_THRESHOLDS: Record<string, number> = {
  BTC: 2,
  ETH: 3,
};
const FALLBACK_THRESHOLD = 5;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'symbols parameter is required' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0 || symbols.length > 20) {
    return NextResponse.json({ error: 'symbols: 1-20 required' }, { status: 400 });
  }

  // Parse optional per-symbol thresholds
  const thresholdsParam = searchParams.get('thresholds');
  const thresholdOverrides: Record<string, number> = {};
  if (thresholdsParam) {
    const vals = thresholdsParam.split(',').map(Number);
    symbols.forEach((s, i) => {
      if (!isNaN(vals[i]) && vals[i] > 0) thresholdOverrides[s] = vals[i];
    });
  }

  function getThreshold(symbol: string): number {
    return thresholdOverrides[symbol] ?? DEFAULT_THRESHOLDS[symbol] ?? FALLBACK_THRESHOLD;
  }

  // Resolve coins and fetch 5m candles (2 latest) in parallel
  // No in-memory state needed — compare the last two 5m candle closes
  const resolved = await Promise.allSettled(
    symbols.map(async (sym) => {
      const coin = await resolveCoin(sym);
      const { candles } = await getKlinesWithTakerVolume(coin, '5m', 3);
      if (candles.length < 2) throw new Error('Insufficient candle data');
      const prevCandle = candles[candles.length - 2];
      const currentCandle = candles[candles.length - 1];
      return {
        symbol: sym,
        prevPrice: prevCandle.close,
        currentPrice: currentCandle.close,
      };
    })
  );

  const alerts: Array<{ symbol: string; prevPrice: number; currentPrice: number; changePercent: number; threshold: number }> = [];
  const errors: Array<{ symbol: string; error: string }> = [];

  for (let i = 0; i < symbols.length; i++) {
    const settled = resolved[i];
    if (settled.status === 'rejected') {
      errors.push({ symbol: symbols[i], error: settled.reason?.message ?? 'Unknown error' });
      continue;
    }

    const { symbol, prevPrice, currentPrice } = settled.value;
    const changePercent = ((currentPrice - prevPrice) / prevPrice) * 100;
    const threshold = getThreshold(symbol);

    if (Math.abs(changePercent) >= threshold) {
      alerts.push({ symbol, prevPrice, currentPrice, changePercent, threshold });
    }
  }

  // Send Telegram notification if any alerts triggered
  let notified = false;
  if (alerts.length > 0) {
    try {
      notified = await notifyPriceAlert(alerts);
    } catch {
      notified = false;
    }
  }

  return NextResponse.json({
    checked: symbols.length,
    alerted: alerts.length,
    alerts: alerts.map((a) => ({
      symbol: a.symbol,
      prev: a.prevPrice,
      current: a.currentPrice,
      change: `${a.changePercent > 0 ? '+' : ''}${a.changePercent.toFixed(2)}%`,
      threshold: a.threshold,
    })),
    errors,
    _telegram: { notified },
  });
}
