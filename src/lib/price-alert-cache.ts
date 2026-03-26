/**
 * In-memory cache for previous prices used by /api/price-alert.
 * Resets on cold start (first invocation skips alerting).
 */

interface PriceEntry {
  price: number;
  ts: number;
}

const priceStore = new Map<string, PriceEntry>();

export function getLastPrice(symbol: string): PriceEntry | null {
  return priceStore.get(symbol) ?? null;
}

export function setLastPrice(symbol: string, price: number): void {
  priceStore.set(symbol, { price, ts: Date.now() });
}
