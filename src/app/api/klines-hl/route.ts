import { NextRequest, NextResponse } from 'next/server';
import { resolveCoin } from '@/lib/symbol-resolver';

const HYPERLIQUID_INFO = 'https://api.hyperliquid.xyz/info';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get('symbol') || 'BTC';
  const interval = searchParams.get('interval') || '1h';
  const limit = Math.min(Number(searchParams.get('limit') || '200'), 1000);
  const endTime = searchParams.get('endTime');

  // Resolve symbol to Hyperliquid API coin name (e.g. "TSLA" → "xyz:TSLA")
  const coin = await resolveCoin(symbol);

  // Calculate startTime from endTime and interval to get `limit` candles
  const intervalMs = getIntervalMs(interval);
  const end = endTime ? Number(endTime) : Date.now();
  const start = end - intervalMs * limit;

  try {
    const res = await fetch(HYPERLIQUID_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin,
          interval,
          startTime: start,
          endTime: end,
        },
      }),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Hyperliquid API error: ${res.status}` },
        { status: res.status },
      );
    }

    const raw = await res.json() as Array<{
      t: number;
      o: string;
      h: string;
      l: string;
      c: string;
      v: string;
    }>;

    const klines = raw.map((k) => ({
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
    }));

    return NextResponse.json(klines);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch klines' }, { status: 500 });
  }
}

function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '8h': 28_800_000,
    '12h': 43_200_000,
    '1d': 86_400_000,
  };
  return map[interval] || 3_600_000;
}
