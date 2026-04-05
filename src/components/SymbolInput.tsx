'use client';

import { useState, useEffect } from 'react';
import { Timeframe, TradingStyle, AssetCategory, SymbolInfo } from '@/lib/types';
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

const CATEGORY_TABS: { value: AssetCategory; label: string }[] = [
  { value: 'crypto', label: '暗号通貨' },
  { value: 'stock', label: '株式' },
  { value: 'commodity', label: 'コモディティ' },
  { value: 'fx', label: 'FX' },
  { value: 'index', label: '指数' },
];

// Fallback popular symbols when API hasn't loaded yet
const FALLBACK_POPULAR: Record<AssetCategory, string[]> = {
  crypto: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
  stock: ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN'],
  commodity: ['GOLD', 'SILVER', 'CL'],
  fx: ['JPY', 'EUR', 'GBP'],
  index: ['SP500', 'XYZ100'],
};

interface Props {
  onAnalyze: (symbol: string, timeframes: Timeframe[], tradingStyle?: TradingStyle) => void;
  loading: boolean;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  tradingStyle: TradingStyle;
  onTradingStyleChange: (style: TradingStyle) => void;
  useCustomTf: boolean;
  onUseCustomTfChange: (custom: boolean) => void;
  selectedTimeframes: Timeframe[];
  onSelectedTimeframesChange: (timeframes: Timeframe[]) => void;
}

export default function SymbolInput({
  onAnalyze,
  loading,
  symbol,
  onSymbolChange,
  tradingStyle,
  onTradingStyleChange,
  useCustomTf,
  onUseCustomTfChange,
  selectedTimeframes,
  onSelectedTimeframesChange,
}: Props) {
  const [category, setCategory] = useState<AssetCategory>('crypto');
  const [popularSymbols, setPopularSymbols] = useState<Record<AssetCategory, string[]>>(FALLBACK_POPULAR);
  const [allSymbols, setAllSymbols] = useState<Record<AssetCategory, SymbolInfo[]> | null>(null);

  // Fetch symbol categories from API on mount
  useEffect(() => {
    fetch('/api/symbols')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.popular) setPopularSymbols(data.popular);
        if (data?.categories) setAllSymbols(data.categories);
      })
      .catch(() => {
        // Keep fallback values
      });
  }, []);

  const handleStyleChange = (style: TradingStyle) => {
    onTradingStyleChange(style);
    onUseCustomTfChange(false);
    onSelectedTimeframesChange(TRADING_STYLE_CONFIGS[style].timeframes);
  };

  const toggleTimeframe = (tf: Timeframe) => {
    onUseCustomTfChange(true);
    if (selectedTimeframes.includes(tf)) {
      if (selectedTimeframes.length <= 1) return;
      onSelectedTimeframesChange(selectedTimeframes.filter((t) => t !== tf));
    } else {
      onSelectedTimeframesChange([...selectedTimeframes, tf]);
    }
  };

  const handleAnalyze = () => {
    if (useCustomTf) {
      onAnalyze(symbol, selectedTimeframes);
    } else {
      onAnalyze(symbol, selectedTimeframes, tradingStyle);
    }
  };

  const handleCategoryChange = (cat: AssetCategory) => {
    setCategory(cat);
    // Auto-select first popular symbol of the category
    const popular = popularSymbols[cat];
    if (popular.length > 0) {
      onSymbolChange(popular[0]);
    }
  };

  const currentPopular = popularSymbols[category] ?? [];

  // Check if non-crypto categories have any symbols
  const hasNonCryptoSymbols = allSymbols
    ? (allSymbols.stock.length > 0 || allSymbols.commodity.length > 0 || allSymbols.fx.length > 0 || allSymbols.index.length > 0)
    : true; // Show tabs by default until API responds

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      {/* Asset Category Tabs */}
      {hasNonCryptoSymbols && (
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          {CATEGORY_TABS.map((tab) => {
            // Hide empty categories once we know the data
            if (allSymbols && allSymbols[tab.value].length === 0 && tab.value !== 'crypto') return null;
            const isActive = category === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => handleCategoryChange(tab.value)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-400 mb-1">シンボル <span className="text-gray-500 text-xs">Hyperliquid上場銘柄を直接入力して分析可能（例: BERA, AVAX, LINK）</span></label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder={category === 'crypto' ? '例: BTC' : category === 'stock' ? '例: TSLA' : category === 'commodity' ? '例: GOLD' : category === 'fx' ? '例: JPY' : '例: SP500'}
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
        {currentPopular.map((s) => (
          <button
            key={s}
            onClick={() => onSymbolChange(s)}
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
