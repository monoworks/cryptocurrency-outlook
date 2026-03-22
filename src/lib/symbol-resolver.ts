import { AssetCategory, SymbolInfo } from './types';

const INFO_URL = 'https://api.hyperliquid.xyz/info';

// ── Category classification patterns ─────────────────────────────────
const COMMODITY_NAMES = new Set([
  'GOLD', 'SILVER', 'CL', 'BRENTOIL', 'COPPER', 'NG', 'PLATINUM',
  'PALLADIUM', 'WHEAT', 'CORN', 'SOYBEAN', 'COFFEE', 'SUGAR', 'COTTON',
  'HG', 'SI', 'GC', 'ZW', 'ZC', 'ZS',
]);

const FX_NAMES = new Set([
  'JPY', 'EUR', 'GBP', 'AUD', 'CHF', 'CAD', 'NZD', 'CNY', 'CNH',
  'SGD', 'HKD', 'KRW', 'SEK', 'NOK', 'MXN', 'TRY', 'ZAR', 'BRL',
  'INR', 'DXY',
]);

const INDEX_NAMES = new Set([
  'SP500', 'SPX', 'NDX', 'DJI', 'DJIA', 'RUT', 'VIX',
  'FTSE', 'DAX', 'CAC', 'NIKKEI', 'HSI', 'KOSPI',
  'XYZ100', 'US500', 'US100', 'US30', 'USA500',
]);

// ── Popular symbols per category ─────────────────────────────────────
const POPULAR_DEFAULTS: Record<AssetCategory, string[]> = {
  crypto: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
  stock: ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN'],
  commodity: ['GOLD', 'SILVER', 'CL', 'BRENTOIL', 'COPPER'],
  fx: ['JPY', 'EUR', 'GBP'],
  index: ['SP500', 'XYZ100'],
};

// ── Types ────────────────────────────────────────────────────────────

interface UniverseAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

interface AssetCtxRaw {
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

interface MetaAndCtxsRaw {
  meta: { universe: UniverseAsset[] };
  ctxs: AssetCtxRaw[];
}

interface PerpDexInfo {
  name: string;
  fullName?: string;
}

interface ResolvedUniverse {
  /** displayName (uppercase) → full API coin name */
  coinMap: Map<string, string>;
  /** category → symbol info array */
  categories: Record<AssetCategory, SymbolInfo[]>;
  /** discovered builder dex names */
  dexNames: string[];
  ts: number;
}

// ── Cache ────────────────────────────────────────────────────────────

let cachedUniverse: ResolvedUniverse | null = null;
const UNIVERSE_CACHE_TTL = 60_000; // 60 seconds

// ── Internal helpers ─────────────────────────────────────────────────

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hyperliquid API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function fetchMetaAndCtxs(dex?: string): Promise<MetaAndCtxsRaw> {
  const body: Record<string, unknown> = { type: 'metaAndAssetCtxs' };
  if (dex !== undefined) body.dex = dex;

  const raw = await postInfo<[MetaAndCtxsRaw['meta'], AssetCtxRaw[]]>(body);
  return { meta: raw[0], ctxs: raw[1] };
}

/**
 * Discover available builder perp dexes via the perpDexs endpoint.
 * Returns an array of dex names (e.g., ["xyz", "cash", "hyna"]).
 */
async function fetchPerpDexNames(): Promise<string[]> {
  try {
    // perpDexs returns an array where index 0 is null (main dex), rest are builder dexes
    const raw = await postInfo<Array<PerpDexInfo | null>>({ type: 'perpDexs' });
    return raw
      .filter((d): d is PerpDexInfo => d !== null && typeof d?.name === 'string')
      .map((d) => d.name);
  } catch (err) {
    console.error('[symbol-resolver] Failed to fetch perpDexs:', err);
    return [];
  }
}

export function classifyBuilderAsset(name: string): AssetCategory {
  const upper = name.toUpperCase();
  if (COMMODITY_NAMES.has(upper)) return 'commodity';
  if (FX_NAMES.has(upper)) return 'fx';
  if (INDEX_NAMES.has(upper)) return 'index';
  return 'stock';
}

async function buildUniverse(): Promise<ResolvedUniverse> {
  const coinMap = new Map<string, string>();
  const categories: Record<AssetCategory, SymbolInfo[]> = {
    crypto: [],
    stock: [],
    commodity: [],
    fx: [],
    index: [],
  };
  let dexNames: string[] = [];

  // Fetch main perps universe
  try {
    const mainData = await fetchMetaAndCtxs();
    for (const asset of mainData.meta.universe) {
      const displayName = asset.name.toUpperCase();
      coinMap.set(displayName, asset.name);
      categories.crypto.push({
        displayName,
        apiCoin: asset.name,
        category: 'crypto',
      });
    }
  } catch (err) {
    console.error('[symbol-resolver] Failed to fetch main universe:', err);
  }

  // Discover builder dex names dynamically
  dexNames = await fetchPerpDexNames();

  // Fetch builder perps universes
  for (const dex of dexNames) {
    try {
      const builderData = await fetchMetaAndCtxs(dex);
      for (const asset of builderData.meta.universe) {
        const displayName = asset.name.toUpperCase();
        const apiCoin = `${dex}:${asset.name}`;
        const category = classifyBuilderAsset(asset.name);

        // Main universe takes priority for name collisions
        if (!coinMap.has(displayName)) {
          coinMap.set(displayName, apiCoin);
        }

        categories[category].push({
          displayName,
          apiCoin,
          category,
        });
      }
    } catch (err) {
      console.error(`[symbol-resolver] Failed to fetch ${dex} universe:`, err);
    }
  }

  return { coinMap, categories, dexNames, ts: Date.now() };
}

async function getUniverse(): Promise<ResolvedUniverse> {
  if (cachedUniverse && Date.now() - cachedUniverse.ts < UNIVERSE_CACHE_TTL) {
    return cachedUniverse;
  }
  cachedUniverse = await buildUniverse();
  return cachedUniverse;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Resolve a user-friendly symbol to the Hyperliquid API coin name.
 * - "BTC" → "BTC" (main perps)
 * - "TSLA" → "xyz:TSLA" (builder perps)
 * - "xyz:TSLA" → "xyz:TSLA" (already qualified)
 */
export async function resolveCoin(symbol: string): Promise<string> {
  // Already qualified with dex prefix
  if (symbol.includes(':')) return symbol;

  const cleaned = symbol.replace(/USDT$/i, '').toUpperCase();
  const universe = await getUniverse();
  const resolved = universe.coinMap.get(cleaned);

  if (resolved) return resolved;

  // Fallback: return as-is (will fail at API level if invalid)
  return cleaned;
}

/**
 * Get categorized symbols with popular symbols per category.
 */
export async function getSymbolCategories(): Promise<{
  categories: Record<AssetCategory, SymbolInfo[]>;
  popular: Record<AssetCategory, string[]>;
}> {
  const universe = await getUniverse();

  // Filter popular defaults to only include existing symbols
  const popular: Record<AssetCategory, string[]> = {
    crypto: [],
    stock: [],
    commodity: [],
    fx: [],
    index: [],
  };

  for (const [cat, defaults] of Object.entries(POPULAR_DEFAULTS) as [AssetCategory, string[]][]) {
    popular[cat] = defaults.filter((name) => universe.coinMap.has(name.toUpperCase()));
  }

  return {
    categories: universe.categories,
    popular,
  };
}

/** Reset cache (for testing) */
export function _resetCache(): void {
  cachedUniverse = null;
}
