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
  onAnalyze: (symbol: string, timeframe: Timeframe) => void;
  loading: boolean;
}

export default function SymbolInput({ onAnalyze, loading }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('4h');

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
        <div>
          <label className="block text-sm text-gray-400 mb-1">時間足</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf.value} value={tf.value}>{tf.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => onAnalyze(symbol, timeframe)}
          disabled={loading || !symbol}
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
    </div>
  );
}
