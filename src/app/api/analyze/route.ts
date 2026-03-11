import { NextRequest, NextResponse } from 'next/server';
import { getKlines, getTicker, getOpenInterest, getFundingRate, getPremiumIndex, getOIHistory, getFundingHistory, getTopTraderRatio } from '@/lib/binance';
import { generateSignal } from '@/lib/signal';
import { Timeframe } from '@/lib/types';

export const preferredRegion = 'hnd1';

const VALID_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get('symbol');
  const timeframesParam = searchParams.get('timeframes');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol パラメータが必要です' }, { status: 400 });
  }
  if (!timeframesParam) {
    return NextResponse.json({ error: 'timeframes パラメータが必要です (例: 1h,4h,1d)' }, { status: 400 });
  }

  const timeframes = timeframesParam.split(',') as Timeframe[];
  const invalid = timeframes.filter((tf) => !VALID_TIMEFRAMES.includes(tf));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `無効な時間足: ${invalid.join(', ')}。${VALID_TIMEFRAMES.join(', ')} から選択してください` },
      { status: 400 }
    );
  }

  try {
    // Fetch candles for each timeframe + shared market data + derivatives history in parallel
    const [candlesResults, ticker, openInterest, fundingRate, premiumIndex, oiHistory, fundingHistory, topTraderRatio] = await Promise.all([
      Promise.all(timeframes.map((tf) => getKlines(symbol, tf).then((candles) => ({ timeframe: tf, candles })))),
      getTicker(symbol),
      getOpenInterest(symbol),
      getFundingRate(symbol),
      getPremiumIndex(symbol),
      getOIHistory(symbol, '1h', 24).catch(() => []),
      getFundingHistory(symbol, 20).catch(() => []),
      getTopTraderRatio(symbol).catch(() => null),
    ]);

    const result = generateSignal({
      symbol: symbol.toUpperCase(),
      ticker,
      openInterest,
      fundingRate,
      premiumIndex,
      candlesByTimeframe: candlesResults,
      derivativesHistory: (oiHistory.length > 0 || fundingHistory.length > 0)
        ? { oiHistory, fundingHistory }
        : undefined,
      topTraderRatio: topTraderRatio ?? undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
