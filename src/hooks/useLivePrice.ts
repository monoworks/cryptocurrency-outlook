'use client';

import { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://api.hyperliquid.xyz/ws';
const RECONNECT_DELAY = 3000;

/** Normalize symbol for Hyperliquid WebSocket.
 *  If already qualified (contains ":"), pass through (e.g. "xyz:TSLA").
 *  Otherwise strip USDT suffix (e.g. "BTCUSDT" → "BTC").
 */
function toCoin(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return symbol.replace(/USDT$/i, '');
}

/**
 * Hyperliquid WebSocket で指定シンボルのリアルタイム mid price を取得するフック。
 * allMids subscription で全銘柄のmid priceを受信し、指定coinのみ返す。
 */
export function useLivePrice(symbol: string | null): number | null {
  const [price, setPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!symbol) {
      setPrice(null);
      return;
    }

    let unmounted = false;
    const coin = toCoin(symbol);

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
 */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;

    let unmounted = false;

    // Build coin → original symbol mapping
    const coinToSymbol: Record<string, string> = {};
    for (const sym of symbols) {
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

// ── Binance版（非表示・バックアップ） ──────────────────────────────────
// 以下のコードはBinance Futures WebSocket版のバックアップです。
// 復元が必要な場合は export を戻してください。

/*
const WS_BASE_BINANCE = 'wss://fstream.binance.com/ws/';

function useLivePrice_Binance(symbol: string | null): number | null {
  // ... Binance版の実装 (BinanceChart.tsx と同様の miniTicker stream)
}

function useLivePrices_Binance(symbols: string[]): Record<string, number> {
  // ... Binance版の実装 (combined stream)
}
*/
