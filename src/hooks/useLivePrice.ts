'use client';

import { useEffect, useRef, useState } from 'react';

const WS_BASE = 'wss://fstream.binance.com/ws/';
const RECONNECT_DELAY = 3000;

/**
 * Binance Futures WebSocket で指定シンボルのリアルタイム価格を取得するフック。
 * 複数シンボルを同時に監視する場合、シンボルごとにフックを呼ぶ。
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

    function connect() {
      if (unmounted || !symbol) return;
      const stream = `${symbol.toLowerCase()}@miniTicker`;
      const ws = new WebSocket(`${WS_BASE}${stream}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.c) {
            setPrice(parseFloat(data.c));
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
 * 複数シンボルのリアルタイム価格を1つの combined stream で取得するフック。
 * PositionManager 用。
 */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;

    let unmounted = false;
    const uniqueSymbols = Array.from(new Set(symbols.map((s) => s.toLowerCase())));

    function connect() {
      if (unmounted) return;
      const streams = uniqueSymbols.map((s) => `${s}@miniTicker`).join('/');
      const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const data = msg.data;
          if (data && data.s && data.c) {
            setPrices((prev) => ({ ...prev, [data.s]: parseFloat(data.c) }));
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
