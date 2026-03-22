import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCoin, getSymbolCategories, classifyBuilderAsset, _resetCache } from '../lib/symbol-resolver';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create a mock Hyperliquid metaAndAssetCtxs response
function mockMetaResponse(assets: { name: string }[]) {
  const universe = assets.map((a) => ({ name: a.name, szDecimals: 2, maxLeverage: 50 }));
  const ctxs = assets.map(() => ({
    funding: '0.0001',
    openInterest: '1000000',
    markPx: '100',
    oraclePx: '100',
    midPx: '100',
    prevDayPx: '99',
    dayNtlVlm: '5000000',
    premium: '0.001',
    impactPxs: ['99.5', '100.5'] as [string, string],
  }));
  return [{ universe }, ctxs];
}

/**
 * Setup mock responses.
 * Builder assets should use the REAL API format where names already include
 * the dex prefix (e.g., { name: "xyz:TSLA" }), matching actual Hyperliquid behavior.
 */
function setupMockResponses(
  mainAssets: { name: string }[],
  builderDexes: { name: string; assets: { name: string }[] }[] = [],
) {
  mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body);

    // perpDexs endpoint — return discovered dex names
    if (body.type === 'perpDexs') {
      const result = [null, ...builderDexes.map((d) => ({ name: d.name, fullName: `${d.name} dex` }))];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(result),
      });
    }

    // metaAndAssetCtxs endpoint
    if (body.type === 'metaAndAssetCtxs') {
      if (body.dex) {
        // Builder dex universe — names already include dex prefix (matching real API)
        const dex = builderDexes.find((d) => d.name === body.dex);
        if (dex) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMetaResponse(dex.assets)),
          });
        }
        // Unknown dex
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('null'),
        });
      }
      // Main universe
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockMetaResponse(mainAssets)),
      });
    }

    return Promise.reject(new Error('Unknown request'));
  });
}

beforeEach(() => {
  _resetCache();
  mockFetch.mockReset();
});

// ────────────────────────────────────────────────────────────────────
// classifyBuilderAsset (pure function, no API calls)
// ────────────────────────────────────────────────────────────────────

describe('classifyBuilderAsset', () => {
  it('classifies known commodities', () => {
    expect(classifyBuilderAsset('GOLD')).toBe('commodity');
    expect(classifyBuilderAsset('SILVER')).toBe('commodity');
    expect(classifyBuilderAsset('CL')).toBe('commodity');
    expect(classifyBuilderAsset('BRENTOIL')).toBe('commodity');
    expect(classifyBuilderAsset('COPPER')).toBe('commodity');
    expect(classifyBuilderAsset('NG')).toBe('commodity');
  });

  it('classifies known FX pairs', () => {
    expect(classifyBuilderAsset('JPY')).toBe('fx');
    expect(classifyBuilderAsset('EUR')).toBe('fx');
    expect(classifyBuilderAsset('GBP')).toBe('fx');
    expect(classifyBuilderAsset('AUD')).toBe('fx');
    expect(classifyBuilderAsset('CHF')).toBe('fx');
    expect(classifyBuilderAsset('DXY')).toBe('fx');
  });

  it('classifies known indices', () => {
    expect(classifyBuilderAsset('SP500')).toBe('index');
    expect(classifyBuilderAsset('XYZ100')).toBe('index');
    expect(classifyBuilderAsset('NDX')).toBe('index');
    expect(classifyBuilderAsset('DJI')).toBe('index');
    expect(classifyBuilderAsset('US500')).toBe('index');
  });

  it('classifies unknown assets as stock', () => {
    expect(classifyBuilderAsset('TSLA')).toBe('stock');
    expect(classifyBuilderAsset('NVDA')).toBe('stock');
    expect(classifyBuilderAsset('AAPL')).toBe('stock');
    expect(classifyBuilderAsset('MSFT')).toBe('stock');
  });

  it('is case-insensitive', () => {
    expect(classifyBuilderAsset('gold')).toBe('commodity');
    expect(classifyBuilderAsset('Gold')).toBe('commodity');
    expect(classifyBuilderAsset('jpy')).toBe('fx');
    expect(classifyBuilderAsset('sp500')).toBe('index');
  });
});

// ────────────────────────────────────────────────────────────────────
// resolveCoin
// ────────────────────────────────────────────────────────────────────

describe('resolveCoin', () => {
  it('passes through already-qualified symbols (with colon)', async () => {
    setupMockResponses([{ name: 'BTC' }]);
    const result = await resolveCoin('xyz:TSLA');
    // Should return as-is without even fetching
    expect(result).toBe('xyz:TSLA');
  });

  it('resolves crypto symbols from main universe', async () => {
    setupMockResponses(
      [{ name: 'BTC' }, { name: 'ETH' }, { name: 'SOL' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }] }],
    );
    expect(await resolveCoin('BTC')).toBe('BTC');
    expect(await resolveCoin('ETH')).toBe('ETH');
  });

  it('resolves stock symbols from builder universe (names include prefix)', async () => {
    // Real API returns names with prefix: "xyz:TSLA", not "TSLA"
    setupMockResponses(
      [{ name: 'BTC' }, { name: 'ETH' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }, { name: 'xyz:NVDA' }, { name: 'xyz:GOLD' }] }],
    );
    expect(await resolveCoin('TSLA')).toBe('xyz:TSLA');
    expect(await resolveCoin('NVDA')).toBe('xyz:NVDA');
    expect(await resolveCoin('GOLD')).toBe('xyz:GOLD');
  });

  it('strips USDT suffix before resolving', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }] }],
    );
    expect(await resolveCoin('BTCUSDT')).toBe('BTC');
    expect(await resolveCoin('btcusdt')).toBe('BTC');
  });

  it('returns cleaned symbol as fallback if not found', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }] }],
    );
    expect(await resolveCoin('UNKNOWN')).toBe('UNKNOWN');
  });

  it('prioritizes main universe over builder universe for name collisions', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:BTC' }] }],
    );
    expect(await resolveCoin('BTC')).toBe('BTC'); // Not "xyz:BTC"
  });

  it('is case-insensitive for symbol input', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }] }],
    );
    expect(await resolveCoin('btc')).toBe('BTC');
    expect(await resolveCoin('tsla')).toBe('xyz:TSLA');
  });

  it('discovers dex names dynamically via perpDexs', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [
        { name: 'xyz', assets: [{ name: 'xyz:TSLA' }] },
        { name: 'cash', assets: [{ name: 'cash:AAPL' }] },
      ],
    );
    expect(await resolveCoin('TSLA')).toBe('xyz:TSLA');
    expect(await resolveCoin('AAPL')).toBe('cash:AAPL');
  });

  it('handles perpDexs failure gracefully', async () => {
    mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      if (body.type === 'perpDexs') {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('error'),
        });
      }
      if (body.type === 'metaAndAssetCtxs' && !body.dex) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetaResponse([{ name: 'BTC' }])),
        });
      }
      return Promise.reject(new Error('Unknown'));
    });

    expect(await resolveCoin('BTC')).toBe('BTC');
    expect(await resolveCoin('TSLA')).toBe('TSLA'); // Fallback
  });
});

// ────────────────────────────────────────────────────────────────────
// getSymbolCategories
// ────────────────────────────────────────────────────────────────────

describe('getSymbolCategories', () => {
  it('categorizes symbols correctly', async () => {
    setupMockResponses(
      [{ name: 'BTC' }, { name: 'ETH' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }, { name: 'xyz:GOLD' }, { name: 'xyz:JPY' }, { name: 'xyz:SP500' }] }],
    );

    const { categories } = await getSymbolCategories();

    expect(categories.crypto).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'BTC', apiCoin: 'BTC', category: 'crypto' }),
        expect.objectContaining({ displayName: 'ETH', apiCoin: 'ETH', category: 'crypto' }),
      ]),
    );

    expect(categories.stock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'TSLA', apiCoin: 'xyz:TSLA', category: 'stock' }),
      ]),
    );

    expect(categories.commodity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'GOLD', apiCoin: 'xyz:GOLD', category: 'commodity' }),
      ]),
    );

    expect(categories.fx).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'JPY', apiCoin: 'xyz:JPY', category: 'fx' }),
      ]),
    );

    expect(categories.index).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'SP500', apiCoin: 'xyz:SP500', category: 'index' }),
      ]),
    );
  });

  it('filters popular symbols to only existing ones', async () => {
    setupMockResponses(
      [{ name: 'BTC' }, { name: 'ETH' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }] }],
    );

    const { popular } = await getSymbolCategories();

    expect(popular.crypto).toEqual(['BTC', 'ETH']);
    expect(popular.stock).toEqual(['TSLA']);
    expect(popular.commodity).toEqual([]);
    expect(popular.fx).toEqual([]);
    expect(popular.index).toEqual([]);
  });

  it('uses cached data on subsequent calls', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [{ name: 'xyz', assets: [{ name: 'xyz:TSLA' }] }],
    );

    await getSymbolCategories();
    await getSymbolCategories();

    // Should have made exactly 3 fetch calls (main + perpDexs + xyz), not 6
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('handles multiple builder dexes', async () => {
    setupMockResponses(
      [{ name: 'BTC' }],
      [
        { name: 'xyz', assets: [{ name: 'xyz:TSLA' }, { name: 'xyz:GOLD' }] },
        { name: 'cash', assets: [{ name: 'cash:AAPL' }, { name: 'cash:SP500' }] },
      ],
    );

    const { categories } = await getSymbolCategories();

    expect(categories.stock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'TSLA', apiCoin: 'xyz:TSLA' }),
        expect.objectContaining({ displayName: 'AAPL', apiCoin: 'cash:AAPL' }),
      ]),
    );
    expect(categories.index).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'SP500', apiCoin: 'cash:SP500' }),
      ]),
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// normalizeCoin integration
// ────────────────────────────────────────────────────────────────────

describe('normalizeCoin integration', () => {
  it('resolveCoin with already-qualified symbol makes no API call', async () => {
    const result = await resolveCoin('xyz:TSLA');
    expect(result).toBe('xyz:TSLA');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
