'use client';

import { useState } from 'react';
import { Timeframe } from '@/lib/types';

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '5m', label: '5分足' },
  { value: '15m', label: '15分足' },
  { value: '1h', label: '1時間足' },
  { value: '4h', label: '4時間足' },
  { value: '1d', label: '日足' },
];

const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

interface Props {
  onAnalyze: (symbol: string, timeframes: Timeframe[]) => void;
  loading: boolean;
}

export default function SymbolInput({ onAnalyze, loading }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(['1h', '4h', '1d']);

  const toggleTimeframe = (tf: Timeframe) => {
    setSelectedTimeframes((prev) => {
      if (prev.includes(tf)) {
        if (prev.length <= 1) return prev; // at least 1 must be selected
        return prev.filter((t) => t !== tf);
      }
      return [...prev, tf];
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-400 mb-1">シンボル</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder="例: BTCUSDT"
          />
        </div>
        <button
          onClick={() => onAnalyze(symbol, selectedTimeframes)}
          disabled={loading || !symbol || selectedTimeframes.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-2 rounded font-medium transition-colors"
        >
          {loading ? '分析中...' : '分析開始'}
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {POPULAR_SYMBOLS.map((s) => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`text-xs px-3 py-1 rounded ${symbol === s ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-2">時間足（複数選択可）</label>
        <div className="flex gap-2 flex-wrap">
          {TIMEFRAMES.map((tf) => {
            const selected = selectedTimeframes.includes(tf.value);
            return (
              <button
                key={tf.value}
                onClick={() => toggleTimeframe(tf.value)}
                className={`text-sm px-4 py-1.5 rounded border transition-colors ${
                  selected
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
