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
} from 'lightweight-charts';

type Interval = '5m' | '15m' | '1h' | '4h' | '1d';

const INTERVALS: { label: string; value: Interval }[] = [
  { label: '5分', value: '5m' },
  { label: '15分', value: '15m' },
  { label: '1時間', value: '1h' },
  { label: '4時間', value: '4h' },
  { label: '日足', value: '1d' },
];

const WS_BASE = 'wss://fstream.binance.com/ws/';
const RECONNECT_DELAY = 3000;

interface Props {
  symbol: string;
}

interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BinanceKlineWsData {
  e: string;
  k: {
    t: number;   // kline start time
    o: string;   // open
    h: string;   // high
    l: string;   // low
    c: string;   // close
    v: string;   // volume
    x: boolean;  // is this kline closed?
  };
}

export default function BinanceChart({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Fetch historical data + connect WebSocket for real-time updates
  const fetchData = useCallback(async () => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: KlineData[] = await res.json();

      const candleData: CandlestickData<Time>[] = data.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      candleSeries.setData(candleData);

      const volumeData: HistogramData<Time>[] = data.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
      }));
      volumeSeries.setData(volumeData);

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

  // WebSocket for real-time kline updates
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || !symbol) return;

    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const stream = `${symbol.toLowerCase()}@kline_${interval}`;
      const ws = new WebSocket(`${WS_BASE}${stream}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const cs = candleSeriesRef.current;
          const vs = volumeSeriesRef.current;
          if (!cs || !vs) return;

          const msg: BinanceKlineWsData = JSON.parse(event.data);
          if (msg.e !== 'kline') return;

          const k = msg.k;
          const time = Math.floor(k.t / 1000) as Time;
          const open = parseFloat(k.o);
          const high = parseFloat(k.h);
          const low = parseFloat(k.l);
          const close = parseFloat(k.c);
          const volume = parseFloat(k.v);

          // update() adds or updates the last candle
          cs.update({ time, open, high, low, close });
          vs.update({
            time,
            value: volume,
            color: close >= open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
          });
        } catch {
          // ignore parse errors
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

  return (
    <div className="bg-[#1a1a2e] border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          {symbol} チャート
          <span className="text-[10px] text-gray-500 font-normal">Binance Futures</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="リアルタイム" />
        </h3>
        <div className="flex gap-1">
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
