import {
  OHLCV,
  Timeframe,
  TickerData,
  OpenInterestData,
  FundingRateData,
  PremiumIndexData,
  MarketData,
} from './types';

const INFO_URL = 'https://api.hyperliquid.xyz/info';

/** Normalize symbol for Hyperliquid API.
 *  - If already qualified (contains ":"), pass through (e.g. "xyz:TSLA" → "xyz:TSLA")
 *  - Otherwise strip USDT suffix (e.g. "BTCUSDT" → "BTC")
 */
function normalizeCoin(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return symbol.replace(/USDT$/i, '');
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: 10 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hyperliquid API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Asset context cache (metaAndAssetCtxs) ──────────────────────────

interface AssetCtx {
  funding: string;
  openInterest: string;
  markPx: string;
  oraclePx: string;
  midPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  impactPxs: [string, string];
}

interface MetaAndCtxs {
  meta: { universe: { name: string; szDecimals: number; maxLeverage: number }[] };
  ctxs: AssetCtx[];
}

const cachedMetaCtxs: Record<string, { data: MetaAndCtxs; ts: number }> = {};
const META_CACHE_TTL = 5_000; // 5 seconds

async function getMetaAndCtxs(dex?: string): Promise<MetaAndCtxs> {
  const cacheKey = dex || '';
  const cached = cachedMetaCtxs[cacheKey];
  if (cached && Date.now() - cached.ts < META_CACHE_TTL) {
    return cached.data;
  }
  const body: Record<string, unknown> = { type: 'metaAndAssetCtxs' };
  if (dex) body.dex = dex;
  const raw = await postInfo<[MetaAndCtxs['meta'], AssetCtx[]]>(body);
  const data: MetaAndCtxs = { meta: raw[0], ctxs: raw[1] };
  cachedMetaCtxs[cacheKey] = { data, ts: Date.now() };
  return data;
}

async function getAssetCtx(coin: string): Promise<{ ctx: AssetCtx; markPrice: number }> {
  let dex: string | undefined;
  let lookupName = coin;

  if (coin.includes(':')) {
    const parts = coin.split(':');
    dex = parts[0];
    lookupName = parts[1];
  }

  const { meta, ctxs } = await getMetaAndCtxs(dex);
  const idx = meta.universe.findIndex((u) => u.name === lookupName);
  if (idx === -1) throw new Error(`Coin ${coin} not found in Hyperliquid universe`);
  const ctx = ctxs[idx];
  return { ctx, markPrice: parseFloat(ctx.markPx) };
}

// ── Klines ───────────────────────────────────────────────────────────

export async function getKlines(symbol: string, interval: Timeframe, limit = 200): Promise<OHLCV[]> {
  const { candles } = await getKlinesWithTakerVolume(symbol, interval, limit);
  return candles;
}

export async function getKlinesWithTakerVolume(symbol: string, interval: Timeframe, limit = 200): Promise<{ candles: OHLCV[]; takerBuyVolumes: number[] }> {
  const coin = normalizeCoin(symbol);
  const intervalMs = getIntervalMs(interval);
  const endTime = Date.now();
  const startTime = endTime - intervalMs * limit;

  const raw = await postInfo<Array<{
    t: number; o: string; h: string; l: string; c: string; v: string;
  }>>({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  });

  const candles: OHLCV[] = raw.map((k) => ({
    time: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
  }));

  // Hyperliquid does not provide taker buy volume — return empty array
  // order-flow.ts will use its price-action estimation fallback
  return { candles, takerBuyVolumes: [] };
}

// ── Ticker ───────────────────────────────────────────────────────────

export async function getTicker(symbol: string): Promise<TickerData> {
  const coin = normalizeCoin(symbol);

  // Fetch asset context + 24h candle for high/low in parallel
  const [{ ctx, markPrice }, dailyCandles] = await Promise.all([
    getAssetCtx(coin),
    postInfo<Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>>({
      type: 'candleSnapshot',
      req: {
        coin,
        interval: '1d',
        startTime: Date.now() - 2 * 86_400_000,
        endTime: Date.now(),
      },
    }),
  ]);

  const prevDayPx = parseFloat(ctx.prevDayPx);
  const priceChangePercent = prevDayPx > 0
    ? ((markPrice - prevDayPx) / prevDayPx) * 100
    : 0;

  const dayNtlVlm = parseFloat(ctx.dayNtlVlm);
  const volume = markPrice > 0 ? dayNtlVlm / markPrice : 0;

  // 24h high/low from the latest daily candle
  const latest = dailyCandles[dailyCandles.length - 1];
  const highPrice = latest ? parseFloat(latest.h) : markPrice;
  const lowPrice = latest ? parseFloat(latest.l) : markPrice;

  return {
    symbol: symbol.toUpperCase(),
    lastPrice: markPrice,
    priceChangePercent,
    volume,
    quoteVolume: dayNtlVlm,
    highPrice,
    lowPrice,
  };
}

// ── Open Interest ────────────────────────────────────────────────────

export async function getOpenInterest(symbol: string): Promise<OpenInterestData> {
  const coin = normalizeCoin(symbol);
  const { ctx } = await getAssetCtx(coin);

  return {
    symbol: symbol.toUpperCase(),
    openInterest: parseFloat(ctx.openInterest),
    time: Date.now(),
  };
}

// ── Funding Rate ─────────────────────────────────────────────────────

export async function getFundingRate(symbol: string): Promise<FundingRateData> {
  const coin = normalizeCoin(symbol);
  const { ctx, markPrice } = await getAssetCtx(coin);

  return {
    symbol: symbol.toUpperCase(),
    fundingRate: parseFloat(ctx.funding),
    fundingTime: Date.now(),
    markPrice,
  };
}

// ── Premium Index ────────────────────────────────────────────────────

export async function getPremiumIndex(symbol: string): Promise<PremiumIndexData> {
  const coin = normalizeCoin(symbol);
  const { ctx } = await getAssetCtx(coin);

  return {
    symbol: symbol.toUpperCase(),
    markPrice: parseFloat(ctx.markPx),
    indexPrice: parseFloat(ctx.oraclePx),
    lastFundingRate: parseFloat(ctx.funding),
    nextFundingTime: 0, // Not available on Hyperliquid
    interestRate: 0.0001, // Hyperliquid default
  };
}

// ── OI History (not available on Hyperliquid) ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getOIHistory(_symbol: string, _period?: string, _limit?: number): Promise<{ time: number; oi: number }[]> {
  return [];
}

// ── Funding History ──────────────────────────────────────────────────

export async function getFundingHistory(symbol: string, limit = 20): Promise<{ time: number; rate: number }[]> {
  const coin = normalizeCoin(symbol);

  // Hyperliquid funding is every 1 hour, fetch enough history
  const startTime = Date.now() - limit * 3_600_000;

  const raw = await postInfo<Array<{
    coin: string;
    fundingRate: string;
    premium: string;
    time: number;
  }>>({
    type: 'fundingHistory',
    coin,
    startTime,
  });

  return raw.slice(-limit).map((d) => ({
    time: d.time,
    rate: parseFloat(d.fundingRate),
  }));
}

// ── Top Trader Ratio (not available on Hyperliquid) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getTopTraderRatio(_symbol: string): Promise<{ longAccount: number; shortAccount: number; longShortRatio: number; timestamp: number } | null> {
  return null;
}

// ── Recent Trades (replaces Binance aggTrades) ───────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getAggTrades(symbol: string, _limit?: number): Promise<{ id: number; price: number; qty: number; quoteQty: number; time: number; isBuyerMaker: boolean }[]> {
  const coin = normalizeCoin(symbol);

  const raw = await postInfo<Array<{
    coin: string;
    px: string;
    sz: string;
    side: string;
    time: number;
    tid: number;
  }>>({
    type: 'recentTrades',
    coin,
  });

  return raw.map((t) => {
    const price = parseFloat(t.px);
    const qty = parseFloat(t.sz);
    return {
      id: t.tid,
      price,
      qty,
      quoteQty: price * qty,
      time: t.time,
      isBuyerMaker: t.side === 'A', // 'A' = ask/sell side = buyer is maker
    };
  });
}

// ── Order Book ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getOrderBookDepth(symbol: string, _limit?: number): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  const coin = normalizeCoin(symbol);

  const raw = await postInfo<{
    levels: Array<Array<{ px: string; sz: string; n: number }>>;
  }>({
    type: 'l2Book',
    coin,
  });

  // raw.levels[0] = bids, raw.levels[1] = asks
  const bids: [number, number][] = (raw.levels[0] || []).map((l) => [parseFloat(l.px), parseFloat(l.sz)]);
  const asks: [number, number][] = (raw.levels[1] || []).map((l) => [parseFloat(l.px), parseFloat(l.sz)]);

  return { bids, asks };
}

// ── Bundled Market Data ──────────────────────────────────────────────

export async function getMarketData(symbol: string, timeframe: Timeframe): Promise<MarketData> {
  const [candles, ticker, openInterest, fundingRate, premiumIndex] = await Promise.all([
    getKlines(symbol, timeframe),
    getTicker(symbol),
    getOpenInterest(symbol),
    getFundingRate(symbol),
    getPremiumIndex(symbol),
  ]);

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    ticker,
    candles,
    openInterest,
    fundingRate,
    premiumIndex,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

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
