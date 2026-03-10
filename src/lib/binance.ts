import {
  OHLCV,
  Timeframe,
  TickerData,
  OpenInterestData,
  FundingRateData,
  PremiumIndexData,
  MarketData,
} from './types';

const BASE_URL = 'https://fapi.binance.com';

async function fetchJSON<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 10 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function getKlines(symbol: string, interval: Timeframe, limit = 200): Promise<OHLCV[]> {
  type KlineRaw = [number, string, string, string, string, string, number, string, number, string, string, string];
  const data = await fetchJSON<KlineRaw[]>('/fapi/v1/klines', {
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(limit),
  });

  return data.map((k) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function getTicker(symbol: string): Promise<TickerData> {
  const data = await fetchJSON<Record<string, string>>('/fapi/v1/ticker/24hr', {
    symbol: symbol.toUpperCase(),
  });

  return {
    symbol: data.symbol,
    lastPrice: parseFloat(data.lastPrice),
    priceChangePercent: parseFloat(data.priceChangePercent),
    volume: parseFloat(data.volume),
    quoteVolume: parseFloat(data.quoteVolume),
    highPrice: parseFloat(data.highPrice),
    lowPrice: parseFloat(data.lowPrice),
  };
}

export async function getOpenInterest(symbol: string): Promise<OpenInterestData> {
  const data = await fetchJSON<Record<string, string>>('/fapi/v1/openInterest', {
    symbol: symbol.toUpperCase(),
  });

  return {
    symbol: data.symbol,
    openInterest: parseFloat(data.openInterest),
    time: Date.now(),
  };
}

export async function getFundingRate(symbol: string): Promise<FundingRateData> {
  type FundingRaw = { symbol: string; fundingRate: string; fundingTime: number; markPrice: string };
  const data = await fetchJSON<FundingRaw[]>('/fapi/v1/fundingRate', {
    symbol: symbol.toUpperCase(),
    limit: '1',
  });

  const latest = data[0];
  return {
    symbol: latest.symbol,
    fundingRate: parseFloat(latest.fundingRate),
    fundingTime: latest.fundingTime,
    markPrice: parseFloat(latest.markPrice),
  };
}

export async function getPremiumIndex(symbol: string): Promise<PremiumIndexData> {
  const data = await fetchJSON<Record<string, string | number>>('/fapi/v1/premiumIndex', {
    symbol: symbol.toUpperCase(),
  });

  return {
    symbol: data.symbol as string,
    markPrice: parseFloat(data.markPrice as string),
    indexPrice: parseFloat(data.indexPrice as string),
    lastFundingRate: parseFloat(data.lastFundingRate as string),
    nextFundingTime: data.nextFundingTime as number,
    interestRate: parseFloat(data.interestRate as string),
  };
}

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
