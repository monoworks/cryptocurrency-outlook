'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CandlestickData,
  HistogramData,
  Time,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import { PriceLevel, VolumeProfileAnalysis } from '@/lib/types';
import { VrvpPrimitive } from './VrvpPrimitive';
import { calcVwapSeries } from '@/lib/indicators';

type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const INTERVALS: { label: string; value: Interval }[] = [
  { label: '1分', value: '1m' },
  { label: '5分', value: '5m' },
  { label: '15分', value: '15m' },
  { label: '1時間', value: '1h' },
  { label: '4時間', value: '4h' },
  { label: '日足', value: '1d' },
];

const WS_URL = 'wss://api.hyperliquid.xyz/ws';
const RECONNECT_DELAY = 3000;
const JST_OFFSET = 9 * 60 * 60;
const LOAD_MORE_THRESHOLD = 10;

interface Props {
  symbol: string;
  levels?: PriceLevel[];
  volumeProfile?: VolumeProfileAnalysis;
}

interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HyperliquidCandle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

function toJST(utcSec: number): Time {
  return (utcSec + JST_OFFSET) as Time;
}

function toCandleData(data: KlineData[]): CandlestickData<Time>[] {
  return data.map((d) => ({
    time: toJST(d.time),
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }));
}

function toVolumeData(data: KlineData[]): HistogramData<Time>[] {
  return data.map((d) => ({
    time: toJST(d.time),
    value: d.volume,
    color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
  }));
}

/** Normalize symbol for Hyperliquid API/WebSocket.
 *  If already qualified (contains ":"), pass through (e.g. "xyz:TSLA").
 *  Otherwise strip USDT suffix (e.g. "BTCUSDT" → "BTC").
 */
function toCoin(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return symbol.replace(/USDT$/i, '');
}

type OverlayToggle = 'sr' | 'vrvp' | 'vwap';

export default function HyperliquidChart({ symbol, levels, volumeProfile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Set<OverlayToggle>>(new Set());
  const overlaysRef = useRef(overlays);
  useEffect(() => { overlaysRef.current = overlays; }, [overlays]);

  const vrvpPrimitiveRef = useRef<VrvpPrimitive | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const allCandlesRef = useRef<KlineData[]>([]);
  const loadingMoreRef = useRef(false);
  const noMoreDataRef = useRef(false);
  const toggleOverlay = (key: OverlayToggle) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a2e' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2a2a4a' },
        horzLines: { color: '#2a2a4a' },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2a2a4a',
      },
      rightPriceScale: {
        borderColor: '#2a2a4a',
      },
      crosshair: {
        mode: 0,
      },
      localization: {
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(d.getUTCDate()).padStart(2, '0');
          const hh = String(d.getUTCHours()).padStart(2, '0');
          const min = String(d.getUTCMinutes()).padStart(2, '0');
          return `${mm}/${dd} ${hh}:${min}`;
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // VWAP line series
    const vwapSeries = chart.addSeries(LineSeries, {
      color: 'rgba(156, 163, 175, 0.8)',
      lineWidth: 2,
      priceScaleId: 'right',
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'VWAP',
    });
    vwapSeriesRef.current = vwapSeries;
    // Initially hidden
    vwapSeries.applyOptions({ visible: false });

    // Attach VRVP primitive to candle series
    const vrvpPrimitive = new VrvpPrimitive();
    candleSeries.attachPrimitive(vrvpPrimitive);
    vrvpPrimitiveRef.current = vrvpPrimitive;

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          chart.applyOptions({ width: w });
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
    };
  }, []);

  // S/R overlay — draw/remove price lines
  const srLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);

  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;

    // Remove existing lines
    for (const line of srLinesRef.current) {
      try { cs.removePriceLine(line); } catch { /* noop */ }
    }
    srLinesRef.current = [];

    if (!overlays.has('sr') || !levels || levels.length === 0) return;

    for (const level of levels) {
      const isSupport = level.type === 'support';
      const color = isSupport ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)';
      const lineWidth = level.strength >= 4 ? 2 : 1;

      const line = cs.createPriceLine({
        price: level.price,
        color,
        lineWidth: lineWidth as 1 | 2,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${isSupport ? 'S' : 'R'}${level.strength}`,
      });
      srLinesRef.current.push(line);
    }
  }, [overlays, levels]);

  // VRVP overlay — horizontal volume profile bars via custom primitive
  useEffect(() => {
    const primitive = vrvpPrimitiveRef.current;
    if (!primitive) return;

    if (overlays.has('vrvp') && volumeProfile && volumeProfile.levels.length > 0) {
      primitive.setProfile(volumeProfile);
    } else {
      primitive.setProfile(null);
    }
  }, [overlays, volumeProfile]);

  // VWAP overlay — show/hide line and update data
  const updateVwap = useCallback(() => {
    const vs = vwapSeriesRef.current;
    if (!vs) return;

    if (overlays.has('vwap') && allCandlesRef.current.length > 0) {
      const vwapData = calcVwapSeries(allCandlesRef.current);
      vs.setData(vwapData.map(d => ({ time: toJST(d.time), value: d.value, color: d.color })));
      vs.applyOptions({ visible: true });
    } else {
      vs.applyOptions({ visible: false });
    }
  }, [overlays]);

  useEffect(() => {
    updateVwap();
  }, [updateVwap]);

  // Load older data
  const loadOlderData = useCallback(async () => {
    if (loadingMoreRef.current || noMoreDataRef.current) return;
    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;
    if (!cs || !vs || allCandlesRef.current.length === 0) return;

    loadingMoreRef.current = true;

    try {
      const oldest = allCandlesRef.current[0];
      const endTime = oldest.time * 1000 - 1;
      const res = await fetch(
        `/api/klines-hl?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200&endTime=${endTime}`
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: KlineData[] = await res.json();

      if (data.length === 0) {
        noMoreDataRef.current = true;
        return;
      }

      allCandlesRef.current = [...data, ...allCandlesRef.current];
      cs.setData(toCandleData(allCandlesRef.current));
      vs.setData(toVolumeData(allCandlesRef.current));
      // Refresh VWAP with full dataset
      if (vwapSeriesRef.current && overlays.has('vwap')) {
        const vwapData = calcVwapSeries(allCandlesRef.current);
        vwapSeriesRef.current.setData(vwapData.map(d => ({ time: toJST(d.time), value: d.value, color: d.color })));
      }
    } catch {
      // silently fail
    } finally {
      loadingMoreRef.current = false;
    }
  }, [symbol, interval]);

  // Infinite scroll
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const handler = () => {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (range && range.from < LOAD_MORE_THRESHOLD) {
        loadOlderData();
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [loadOlderData]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    setLoading(true);
    setError(null);
    allCandlesRef.current = [];
    noMoreDataRef.current = false;

    try {
      const res = await fetch(`/api/klines-hl?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: KlineData[] = await res.json();

      allCandlesRef.current = data;
      candleSeries.setData(toCandleData(data));
      volumeSeries.setData(toVolumeData(data));
      // Update VWAP if enabled
      if (vwapSeriesRef.current && overlays.has('vwap')) {
        const vwapData = calcVwapSeries(data);
        vwapSeriesRef.current.setData(vwapData.map(d => ({ time: toJST(d.time), value: d.value, color: d.color })));
        vwapSeriesRef.current.applyOptions({ visible: true });
      }
      chart.timeScale().fitContent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket — Hyperliquid candle subscription
  useEffect(() => {
    if (!symbol) return;

    let unmounted = false;
    const coin = toCoin(symbol);

    function connect() {
      if (unmounted) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: {
            type: 'candle',
            coin,
            interval,
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const cs = candleSeriesRef.current;
          const vs = volumeSeriesRef.current;
          if (!cs || !vs) return;

          const msg = JSON.parse(event.data);

          // Hyperliquid WS format: { channel: "candle", data: { ... } }
          if (msg.channel !== 'candle') return;
          const candle: HyperliquidCandle = msg.data;

          const utcSec = Math.floor(candle.t / 1000);
          const time = toJST(utcSec);
          const open = parseFloat(candle.o);
          const high = parseFloat(candle.h);
          const low = parseFloat(candle.l);
          const close = parseFloat(candle.c);
          const volume = parseFloat(candle.v);

          cs.update({ time, open, high, low, close });
          vs.update({
            time,
            value: volume,
            color: close >= open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
          });

          const all = allCandlesRef.current;
          if (all.length > 0 && all[all.length - 1].time === utcSec) {
            all[all.length - 1] = { time: utcSec, open, high, low, close, volume };
          } else {
            all.push({ time: utcSec, open, high, low, close, volume });
          }

          // VWAP更新（有効時のみ）
          const vwapSeries = vwapSeriesRef.current;
          if (vwapSeries && overlaysRef.current.has('vwap')) {
            const vwapData = calcVwapSeries(all);
            vwapSeries.setData(vwapData.map(d => ({ time: toJST(d.time), value: d.value, color: d.color })));
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, interval]);

  const hasLevels = levels && levels.length > 0;
  const hasVP = volumeProfile && volumeProfile.levels.length > 0;

  return (
    <div className="bg-[#1a1a2e] border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          {symbol} チャート
          <span className="text-[10px] text-gray-500 font-normal">Hyperliquid</span>
          <span className="text-[10px] text-gray-500 font-normal">JST</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="リアルタイム" />
        </h3>
        <div className="flex gap-1">
          {/* Overlay toggles */}
          {hasLevels && (
            <button
              onClick={() => toggleOverlay('sr')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                overlays.has('sr')
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              S/R
            </button>
          )}
          {hasVP && (
            <button
              onClick={() => toggleOverlay('vrvp')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                overlays.has('vrvp')
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              VRVP
            </button>
          )}
          <button
            onClick={() => toggleOverlay('vwap')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              overlays.has('vwap')
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            VWAP
          </button>
          <span className="w-px bg-gray-600 mx-0.5" />
          {/* Interval buttons */}
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                interval === iv.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-xs mb-2">{error}</div>
      )}

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/80 z-10">
            <span className="text-gray-400 text-sm">読み込み中...</span>
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </div>
  );
}
