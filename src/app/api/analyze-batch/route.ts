import { NextRequest, NextResponse } from 'next/server';
import { getKlinesWithTakerVolume, getTicker, getOpenInterest, getFundingRate, getPremiumIndex, getOIHistory, getFundingHistory, getTopTraderRatio, getAggTrades, getOrderBookDepth } from '@/lib/hyperliquid';
import { analyzeWhaleActivity } from '@/lib/whale-detection';
import { generateSignal } from '@/lib/signal';
import { Timeframe, AnalysisResult } from '@/lib/types';
import { fetchFearGreedIndex } from '@/lib/sentiment';
import { fetchEconomicCalendar } from '@/lib/economic-calendar';
import { fetchNews } from '@/lib/news';
import { notifyBatchSignals } from '@/lib/telegram';
import { getNewsCache, getFearGreedCache, getEconomicCalendarCache, isFresh } from '@/lib/external-cache';

export const preferredRegion = 'hnd1';
export const maxDuration = 60;

const VALID_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];
const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'];

/**
 * Analyze a single symbol (same logic as /api/analyze).
 */
async function analyzeSymbol(
  symbol: string,
  timeframes: Timeframe[],
  sharedData: { fearGreed: unknown; economicEvents: unknown; newsArticles: unknown },
): Promise<AnalysisResult> {
  const [candlesResults, ticker, openInterest, fundingRate, premiumIndex, oiHistory, fundingHistory, topTraderRatio, aggTrades, orderBook] = await Promise.all([
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
    getAggTrades(symbol, 1000).catch(() => []),
    getOrderBookDepth(symbol, 20).catch(() => ({ bids: [] as [number, number][], asks: [] as [number, number][] })),
  ]);

  const whaleActivity = (aggTrades.length > 0 || orderBook.bids.length > 0)
    ? analyzeWhaleActivity(aggTrades, orderBook, ticker.lastPrice, {
        quoteVolume24h: ticker.quoteVolume,
      })
    : undefined;

  return generateSignal({
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
    fearGreed: sharedData.fearGreed ?? undefined,
    economicEvents: sharedData.economicEvents ?? undefined,
    newsArticles: sharedData.newsArticles,
    whaleActivity,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * GET /api/analyze-batch?symbols=BTC,ETH,SOL&timeframes=15m,1h,4h
 *
 * Analyzes multiple symbols in parallel and sends a single combined Telegram notification.
 * - symbols: comma-separated (default: BTC,ETH,SOL)
 * - timeframes: comma-separated (required)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbolsParam = searchParams.get('symbols');
  const timeframesParam = searchParams.get('timeframes');

  if (!timeframesParam) {
    return NextResponse.json({ error: 'timeframes パラメータが必要です (例: 15m,1h,4h)' }, { status: 400 });
  }

  const timeframes = timeframesParam.split(',') as Timeframe[];
  const invalid = timeframes.filter((tf) => !VALID_TIMEFRAMES.includes(tf));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `無効な時間足: ${invalid.join(', ')}。${VALID_TIMEFRAMES.join(', ')} から選択してください` },
      { status: 400 },
    );
  }

  const symbols = symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_SYMBOLS;

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols パラメータが空です' }, { status: 400 });
  }
  if (symbols.length > 10) {
    return NextResponse.json({ error: '一度に分析できるシンボルは最大10です' }, { status: 400 });
  }

  try {
    // Fetch shared external data (same for all symbols)
    const NEWS_MAX_AGE = 10 * 60 * 1000;
    const EXTERNAL_MAX_AGE = 60 * 60 * 1000;

    const cachedNews = getNewsCache();
    const cachedFearGreed = getFearGreedCache();
    const cachedEconomic = getEconomicCalendarCache();

    const [fearGreed, economicEvents, newsArticles] = await Promise.all([
      isFresh(cachedFearGreed, EXTERNAL_MAX_AGE)
        ? Promise.resolve(cachedFearGreed!.data)
        : fetchFearGreedIndex().catch(() => null),
      isFresh(cachedEconomic, EXTERNAL_MAX_AGE)
        ? Promise.resolve(cachedEconomic!.data)
        : fetchEconomicCalendar().catch(() => null),
      isFresh(cachedNews, NEWS_MAX_AGE)
        ? Promise.resolve(cachedNews!.data)
        : fetchNews().catch(() => null),
    ]);

    const sharedData = { fearGreed, economicEvents, newsArticles };

    // Analyze all symbols in parallel
    const settledResults = await Promise.allSettled(
      symbols.map((sym) => analyzeSymbol(sym, timeframes, sharedData)),
    );

    const results: AnalysisResult[] = [];
    const errors: { symbol: string; error: string }[] = [];

    settledResults.forEach((settled, i) => {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        errors.push({ symbol: symbols[i], error: settled.reason?.message ?? 'Unknown error' });
      }
    });

    // Send combined Telegram notification
    const notified = results.length > 0
      ? await notifyBatchSignals(results).catch(() => false)
      : false;

    // By default return a compact summary (safe for CRON output limits).
    // UI passes ?full=true to get the complete AnalysisResult.
    if (searchParams.get('full') === 'true') {
      return NextResponse.json({
        results,
        errors,
        _telegram: { notified, symbolCount: results.length },
      });
    }

    return NextResponse.json({
      results: results.map((r) => ({
        symbol: r.marketSummary.symbol,
        conclusion: r.conclusion,
        conclusionReason: r.conclusionReason,
        confidence: r.confidence?.score ?? null,
        price: r.marketSummary.currentPrice,
      })),
      errors,
      _telegram: { notified, symbolCount: results.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
