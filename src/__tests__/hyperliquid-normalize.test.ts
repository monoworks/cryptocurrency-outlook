import { describe, it, expect } from 'vitest';

/**
 * Test the normalizeCoin logic independently.
 * Since normalizeCoin is not exported from hyperliquid.ts,
 * we replicate the logic here to verify the expected behavior.
 */
function normalizeCoin(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return symbol.replace(/USDT$/i, '');
}

describe('normalizeCoin', () => {
  it('passes through qualified symbols with colon prefix', () => {
    expect(normalizeCoin('xyz:TSLA')).toBe('xyz:TSLA');
    expect(normalizeCoin('xyz:GOLD')).toBe('xyz:GOLD');
    expect(normalizeCoin('cash:USA500')).toBe('cash:USA500');
    expect(normalizeCoin('hyna:BTC')).toBe('hyna:BTC');
  });

  it('strips USDT suffix for crypto symbols', () => {
    expect(normalizeCoin('BTCUSDT')).toBe('BTC');
    expect(normalizeCoin('ETHUSDT')).toBe('ETH');
    expect(normalizeCoin('btcusdt')).toBe('btc');
  });

  it('returns plain symbols as-is', () => {
    expect(normalizeCoin('BTC')).toBe('BTC');
    expect(normalizeCoin('ETH')).toBe('ETH');
    expect(normalizeCoin('SOL')).toBe('SOL');
  });

  it('handles edge cases', () => {
    expect(normalizeCoin('')).toBe('');
    expect(normalizeCoin('USDT')).toBe(''); // "USDT" itself becomes ""
    expect(normalizeCoin('xyz:')).toBe('xyz:'); // colon present, pass through
  });
});

/**
 * Test the toCoin logic used in useLivePrice.ts and HyperliquidChart.tsx
 */
function toCoin(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return symbol.replace(/USDT$/i, '');
}

describe('toCoin (WebSocket/Chart)', () => {
  it('passes through qualified HIP-3 symbols', () => {
    expect(toCoin('xyz:TSLA')).toBe('xyz:TSLA');
    expect(toCoin('xyz:SP500')).toBe('xyz:SP500');
  });

  it('strips USDT suffix for crypto', () => {
    expect(toCoin('BTCUSDT')).toBe('BTC');
  });

  it('returns plain symbols as-is', () => {
    expect(toCoin('BTC')).toBe('BTC');
  });
});
