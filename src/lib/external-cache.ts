import { NewsArticle, EconomicEvent } from './types';
import { FearGreedData } from './sentiment';

/**
 * In-memory cache for external (non-Binance) API data.
 * Written by /api/news-notify (news) and /api/refresh-external (fear&greed, economic calendar).
 * Read by /api/analyze to avoid redundant external API calls during 1-min cron.
 */

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

let newsCache: CacheEntry<NewsArticle[]> | null = null;
let fearGreedCache: CacheEntry<FearGreedData> | null = null;
let economicCalendarCache: CacheEntry<EconomicEvent[]> | null = null;

// --- News ---

export function setNewsCache(articles: NewsArticle[]): void {
  newsCache = { data: articles, updatedAt: Date.now() };
}

export function getNewsCache(): { data: NewsArticle[]; updatedAt: number } | null {
  return newsCache;
}

// --- Fear & Greed ---

export function setFearGreedCache(data: FearGreedData): void {
  fearGreedCache = { data, updatedAt: Date.now() };
}

export function getFearGreedCache(): { data: FearGreedData; updatedAt: number } | null {
  return fearGreedCache;
}

// --- Economic Calendar ---

export function setEconomicCalendarCache(events: EconomicEvent[]): void {
  economicCalendarCache = { data: events, updatedAt: Date.now() };
}

export function getEconomicCalendarCache(): { data: EconomicEvent[]; updatedAt: number } | null {
  return economicCalendarCache;
}

// --- Utility ---

/** Check if a cache entry is within the given max age (ms). */
export function isFresh(entry: { updatedAt: number } | null, maxAgeMs: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.updatedAt < maxAgeMs;
}
