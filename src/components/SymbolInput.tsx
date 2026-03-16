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

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];

interface Props {
  onAnalyze: (symbol: string, timeframes: Timeframe[]) => void;
  loading: boolean;
}

export default function SymbolInput({ onAnalyze, loading }: Props) {
  const [symbol, setSymbol] = useState('BTC');
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(['15m', '1h', '4h']);

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
            placeholder="例: BTC"
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
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          💡 超短期（数分〜1時間程度）は5分足・15分足、デイトレード（数時間〜8時間程度）は15分足・1時間足・4時間足、スイング（数日程度）は1時間足・4時間足・日足の組み合わせが効果的です。
        </p>
        <p className="text-xs text-yellow-600/80 mt-1.5 leading-relaxed">
          ⚠️ 本分析はテクニカル指標に基づく参考情報です。紛争・制裁・規制変更・取引所障害などの突発事象による急変動は予測できません。投資判断はご自身の責任でお願いします。
        </p>
      </div>
    </div>
  );
}
