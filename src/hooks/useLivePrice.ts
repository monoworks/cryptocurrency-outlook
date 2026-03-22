'use client';

import { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://api.hyperliquid.xyz/ws';
const RECONNECT_DELAY = 3000;
const POLL_INTERVAL = 5000; // 5 seconds polling for HIP-3 assets

/** Normalize symbol for Hyperliquid WebSocket.
 *  If already qualified (contains ":"), pass through (e.g. "xyz:TSLA").
 *  Otherwise strip USDT suffix (e.g. "BTCUSDT" → "BTC").
 */
function toCoin(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return symbol.replace(/USDT$/i, '');
}

/** Check if a coin is a HIP-3 builder perp (contains ":") */
function isBuilderPerp(coin: string): boolean {
  return coin.includes(':');
}

/**
 * Hyperliquid WebSocket で指定シンボルのリアルタイム mid price を取得するフック。
 * - 暗号通貨: allMids subscription で全銘柄のmid priceを受信
 * - HIP-3 (株式等): allMidsに含まれないため、REST APIポーリングにフォールバック
 */
export function useLivePrice(symbol: string | null): number | null {
  const [price, setPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!symbol) {
      setPrice(null);
      return;
    }

    let unmounted = false;
    const coin = toCoin(symbol);

    // HIP-3 assets: use REST API polling (allMids WS doesn't include them)
    if (isBuilderPerp(coin)) {
      const pollPrice = async () => {
        if (unmounted) return;
        try {
          const dex = coin.split(':')[0];
          const infoRes = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs', dex }),
          });
          if (!infoRes.ok) return;
          const data = await infoRes.json();
          const meta = data[0];
          const ctxs = data[1];
          const idx = meta?.universe?.findIndex((u: { name: string }) => u.name === coin);
          if (idx !== undefined && idx >= 0 && ctxs[idx]) {
            const midPx = parseFloat(ctxs[idx].midPx || ctxs[idx].markPx);
            if (!unmounted && !isNaN(midPx)) {
              setPrice(midPx);
            }
          }
        } catch {
          // ignore polling errors
        }
      };

      pollPrice();
      pollTimer.current = setInterval(pollPrice, POLL_INTERVAL);

      return () => {
        unmounted = true;
        if (pollTimer.current) clearInterval(pollTimer.current);
      };
    }

    // Regular crypto: use WebSocket
    function connect() {
      if (unmounted) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'allMids' },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel !== 'allMids') return;
          const mids: Record<string, string> = msg.data?.mids;
          if (mids && mids[coin]) {
            setPrice(parseFloat(mids[coin]));
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [symbol]);

  return price;
}

/**
 * 複数シンボルのリアルタイム価格を1つの allMids subscription で取得するフック。
 * PositionManager / AnalysisHistory 用。
 * キーは元のシンボル形式で返す（既存コンポーネント互換）。
 * 注: HIP-3アセットはこのフックではサポートされません。
 */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;

    let unmounted = false;

    // Filter out builder perps — they don't appear in allMids
    const cryptoSymbols = symbols.filter((s) => !toCoin(s).includes(':'));
    if (cryptoSymbols.length === 0) return;

    // Build coin → original symbol mapping
    const coinToSymbol: Record<string, string> = {};
    for (const sym of cryptoSymbols) {
      coinToSymbol[toCoin(sym)] = sym.toUpperCase();
    }
    const coins = Object.keys(coinToSymbol);

    function connect() {
      if (unmounted) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'allMids' },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel !== 'allMids') return;
          const mids: Record<string, string> = msg.data?.mids;
          if (!mids) return;

          const updates: Record<string, number> = {};
          for (const coin of coins) {
            if (mids[coin]) {
              updates[coinToSymbol[coin]] = parseFloat(mids[coin]);
            }
          }
          if (Object.keys(updates).length > 0) {
            setPrices((prev) => ({ ...prev, ...updates }));
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  return prices;
}
