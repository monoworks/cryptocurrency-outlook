'use client';

import { useState } from 'react';
import { Timeframe, TradingStyle } from '@/lib/types';
import { TRADING_STYLE_CONFIGS } from '@/lib/trading-style';

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '5m', label: '5分足' },
  { value: '15m', label: '15分足' },
  { value: '1h', label: '1時間足' },
  { value: '4h', label: '4時間足' },
  { value: '1d', label: '日足' },
];

const TRADING_STYLES: { value: TradingStyle; label: string; desc: string }[] = [
  { value: 'scalping', label: 'スキャルピング', desc: '数分〜1時間' },
  { value: 'day_trade', label: 'デイトレード', desc: '数時間〜半日' },
  { value: 'swing', label: 'スイング', desc: '数日' },
];

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];

interface Props {
  onAnalyze: (symbol: string, timeframes: Timeframe[], tradingStyle?: TradingStyle) => void;
  loading: boolean;
}

export default function SymbolInput({ onAnalyze, loading }: Props) {
  const [symbol, setSymbol] = useState('BTC');
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('swing');
  const [useCustomTf, setUseCustomTf] = useState(false);
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(['15m', '1h', '4h']);

  const handleStyleChange = (style: TradingStyle) => {
    setTradingStyle(style);
    setUseCustomTf(false);
    // Update displayed timeframes to match the style
    setSelectedTimeframes(TRADING_STYLE_CONFIGS[style].timeframes);
  };

  const toggleTimeframe = (tf: Timeframe) => {
    setUseCustomTf(true);
    setSelectedTimeframes((prev) => {
      if (prev.includes(tf)) {
        if (prev.length <= 1) return prev;
        return prev.filter((t) => t !== tf);
      }
      return [...prev, tf];
    });
  };

  const handleAnalyze = () => {
    if (useCustomTf) {
      // Custom timeframe selection — don't pass tradingStyle (use swing defaults)
      onAnalyze(symbol, selectedTimeframes);
    } else {
      // Style-based — pass tradingStyle
      onAnalyze(symbol, selectedTimeframes, tradingStyle);
    }
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
          onClick={handleAnalyze}
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

      {/* Trading Style Selection */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">トレードスタイル</label>
        <div className="flex gap-2 flex-wrap">
          {TRADING_STYLES.map((style) => {
            const selected = !useCustomTf && tradingStyle === style.value;
            return (
              <button
                key={style.value}
                onClick={() => handleStyleChange(style.value)}
                className={`text-sm px-4 py-1.5 rounded border transition-colors ${
                  selected
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                {style.label}
                <span className="text-xs ml-1 opacity-70">({style.desc})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          時間足
          {!useCustomTf && (
            <span className="text-xs text-purple-400 ml-2">
              {TRADING_STYLE_CONFIGS[tradingStyle].label}プリセット適用中
            </span>
          )}
          {useCustomTf && (
            <span className="text-xs text-yellow-400 ml-2">カスタム選択</span>
          )}
        </label>
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
        <p className="text-xs text-yellow-600/80 mt-2 leading-relaxed">
          ⚠️ 本分析はテクニカル指標に基づく参考情報です。紛争・制裁・規制変更・取引所障害などの突発事象による急変動は予測できません。投資判断はご自身の責任でお願いします。
        </p>
      </div>
    </div>
  );
}
