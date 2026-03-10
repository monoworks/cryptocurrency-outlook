import { NextRequest, NextResponse } from 'next/server';
import { getMarketData } from '@/lib/binance';
import { generateSignal } from '@/lib/signal';
import { Timeframe } from '@/lib/types';

const VALID_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get('symbol');
  const timeframe = searchParams.get('timeframe') as Timeframe | null;

  if (!symbol) {
    return NextResponse.json({ error: 'symbol パラメータが必要です' }, { status: 400 });
  }
  if (!timeframe || !VALID_TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json({ error: `timeframe は ${VALID_TIMEFRAMES.join(', ')} のいずれかを指定してください` }, { status: 400 });
  }

  try {
    const data = await getMarketData(symbol, timeframe);
    const result = generateSignal(data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
