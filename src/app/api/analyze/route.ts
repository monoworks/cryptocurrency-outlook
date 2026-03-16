import { NextRequest, NextResponse } from 'next/server';
import { getKlinesWithTakerVolume, getTicker, getOpenInterest, getFundingRate, getPremiumIndex, getOIHistory, getFundingHistory, getTopTraderRatio, getAggTrades, getOrderBookDepth } from '@/lib/binance';
import { analyzeWhaleActivity } from '@/lib/whale-detection';
import { generateSignal } from '@/lib/signal';
import { Timeframe } from '@/lib/types';
import { fetchFearGreedIndex } from '@/lib/sentiment';
import { fetchEconomicCalendar } from '@/lib/economic-calendar';
import { fetchNews } from '@/lib/news';
import { notifySignal } from '@/lib/telegram';
import { getNewsCache, getFearGreedCache, getEconomicCalendarCache, isFresh } from '@/lib/external-cache';

export const preferredRegion = 'hnd1';

const VALID_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get('symbol');
  const timeframesParam = searchParams.get('timeframes');
  const notify = searchParams.get('notify') !== 'false';

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
    // Read external data from cache (populated by /api/news-notify and /api/refresh-external crons).
    // Fall back to direct fetch only if cache is empty (e.g. first run after deploy).
    const NEWS_MAX_AGE = 10 * 60 * 1000;       // 10 min (news-notify runs every 5 min)
    const EXTERNAL_MAX_AGE = 60 * 60 * 1000;   // 60 min (refresh-external runs every 30 min)

    const cachedNews = getNewsCache();
    const cachedFearGreed = getFearGreedCache();
    const cachedEconomic = getEconomicCalendarCache();

    // Fetch Binance data + fallback external data in parallel
    const [candlesResults, ticker, openInterest, fundingRate, premiumIndex, oiHistory, fundingHistory, topTraderRatio, fearGreed, economicEvents, newsArticles, aggTrades, orderBook] = await Promise.all([
      Promise.all(timeframes.map((tf) =>
        getKlinesWithTakerVolume(symbol, tf).then((r) => ({ timeframe: tf, candles: r.candles, takerBuyVolumes: r.takerBuyVolumes }))
      )),
      getTicker(symbol),
      getOpenInterest(symbol),
      getFundingRate(symbol),
      getPremiumIndex(symbol),
      getOIHistory(symbol, '1h', 24).catch(() => []),
      getFundingHistory(symbol, 20).catch(() => []),
      getTopTraderRatio(symbol).catch(() => null),
      isFresh(cachedFearGreed, EXTERNAL_MAX_AGE)
        ? Promise.resolve(cachedFearGreed!.data)
        : fetchFearGreedIndex().catch(() => null),
      isFresh(cachedEconomic, EXTERNAL_MAX_AGE)
        ? Promise.resolve(cachedEconomic!.data)
        : fetchEconomicCalendar().catch(() => null),
      isFresh(cachedNews, NEWS_MAX_AGE)
        ? Promise.resolve(cachedNews!.data)
        : fetchNews().catch(() => null),
      getAggTrades(symbol, 1000).catch(() => []),
      getOrderBookDepth(symbol, 500).catch(() => ({ bids: [] as [number, number][], asks: [] as [number, number][] })),
    ]);

    // Whale activity detection
    const whaleActivity = (aggTrades.length > 0 || orderBook.bids.length > 0)
      ? analyzeWhaleActivity(aggTrades, orderBook, ticker.lastPrice, {
          quoteVolume24h: ticker.quoteVolume,
        })
      : undefined;

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
      fearGreed: fearGreed ?? undefined,
      economicEvents: economicEvents ?? undefined,
      newsArticles,
      whaleActivity,
    });

    // Send Telegram notification for actionable signals (skip when notify=false)
    const notified = notify
      ? await notifySignal(result).catch(() => false)
      : false;

    // By default return a compact summary (safe for CRON output limits).
    // UI passes ?full=true to get the complete AnalysisResult.
    if (searchParams.get('full') === 'true') {
      return NextResponse.json({ ...result, _telegram: { notified, conclusion: result.conclusion } });
    }

    return NextResponse.json({
      symbol: result.marketSummary.symbol,
      conclusion: result.conclusion,
      conclusionReason: result.conclusionReason,
      confidence: result.confidence?.score ?? null,
      price: result.marketSummary.currentPrice,
      _telegram: { notified },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
