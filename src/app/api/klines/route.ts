import { NextRequest, NextResponse } from 'next/server';

const BINANCE_API = 'https://api.binance.com/api/v3/klines';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get('symbol') || 'BTC';
  const interval = searchParams.get('interval') || '1h';
  const limit = Math.min(Number(searchParams.get('limit') || '200'), 1000);

  const endTime = searchParams.get('endTime');

  let url = `${BINANCE_API}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  if (endTime) {
    url += `&endTime=${encodeURIComponent(endTime)}`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json({ error: `Binance API error: ${res.status}` }, { status: res.status });
    }

    const raw = await res.json() as number[][];

    const klines = raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1] as unknown as string),
      high: parseFloat(k[2] as unknown as string),
      close: parseFloat(k[4] as unknown as string),
      low: parseFloat(k[3] as unknown as string),
      volume: parseFloat(k[5] as unknown as string),
    }));

    return NextResponse.json(klines);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch klines' }, { status: 500 });
  }
}
