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
  const { candles } = await getKlinesWithTakerVolume(symbol, interval, limit);
  return candles;
}

export async function getKlinesWithTakerVolume(symbol: string, interval: Timeframe, limit = 200): Promise<{ candles: OHLCV[]; takerBuyVolumes: number[] }> {
  type KlineRaw = [number, string, string, string, string, string, number, string, number, string, string, string];
  const data = await fetchJSON<KlineRaw[]>('/fapi/v1/klines', {
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(limit),
  });

  const candles = data.map((k) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));

  const takerBuyVolumes = data.map((k) => parseFloat(k[9]));

  return { candles, takerBuyVolumes };
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

export async function getOIHistory(symbol: string, period = '1h', limit = 24): Promise<{ time: number; oi: number }[]> {
  type OIHistRaw = { symbol: string; sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number };
  const data = await fetchJSON<OIHistRaw[]>('/futures/data/openInterestHist', {
    symbol: symbol.toUpperCase(),
    period,
    limit: String(limit),
  });
  return data.map((d) => ({ time: d.timestamp, oi: parseFloat(d.sumOpenInterest) }));
}

export async function getFundingHistory(symbol: string, limit = 20): Promise<{ time: number; rate: number }[]> {
  type FundingRaw = { symbol: string; fundingRate: string; fundingTime: number; markPrice: string };
  const data = await fetchJSON<FundingRaw[]>('/fapi/v1/fundingRate', {
    symbol: symbol.toUpperCase(),
    limit: String(limit),
  });
  return data.map((d) => ({ time: d.fundingTime, rate: parseFloat(d.fundingRate) }));
}

export async function getTopTraderRatio(symbol: string): Promise<{ longAccount: number; shortAccount: number; longShortRatio: number; timestamp: number }> {
  type RatioRaw = { symbol: string; longAccount: string; shortAccount: string; longShortRatio: string; timestamp: number };
  const data = await fetchJSON<RatioRaw[]>('/futures/data/topLongShortAccountRatio', {
    symbol: symbol.toUpperCase(),
    period: '1h',
    limit: '1',
  });
  const latest = data[0];
  return {
    longAccount: parseFloat(latest.longAccount),
    shortAccount: parseFloat(latest.shortAccount),
    longShortRatio: parseFloat(latest.longShortRatio),
    timestamp: latest.timestamp,
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
