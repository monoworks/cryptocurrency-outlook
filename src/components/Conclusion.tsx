'use client';

import { SignalConclusion, CandlePattern, DerivativesAnalysis, IndicatorValues } from '@/lib/types';
import HelpTip from './HelpTip';

const CONCLUSION_CONFIG: Record<SignalConclusion, { label: string; color: string; bg: string }> = {
  enter_long: { label: 'ロングエントリー推奨', color: 'text-green-400', bg: 'bg-green-900/30 border-green-500' },
  enter_short: { label: 'ショートエントリー推奨', color: 'text-red-400', bg: 'bg-red-900/30 border-red-500' },
  wait: { label: '引きつけて待機', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-500' },
  skip: { label: '見送り推奨', color: 'text-gray-400', bg: 'bg-gray-700/30 border-gray-500' },
};

interface Props {
  conclusion: SignalConclusion;
  reason: string;
  patterns: CandlePattern[];
  derivatives: DerivativesAnalysis;
  indicators: IndicatorValues;
}

export default function Conclusion({ conclusion, reason, patterns, derivatives, indicators }: Props) {
  const config = CONCLUSION_CONFIG[conclusion];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">⑥ 結論</h2>
      <div className={`border rounded-lg p-4 ${config.bg}`}>
        <div className={`text-xl font-bold ${config.color} mb-2`}>{config.label}</div>
        <p className="text-gray-300 text-sm">{reason}</p>
      </div>

      {/* Extra details */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        {/* Patterns */}
        <div>
          <h4 className="text-gray-400 font-semibold mb-1">ローソク足パターン<HelpTip text="チャートの形から読み取れる、次の値動きのヒントです" /></h4>
          {patterns.length === 0 ? (
            <p className="text-gray-500">特筆なし</p>
          ) : (
            patterns.map((p, i) => (
              <div key={i} className={`${p.signal === 'bullish' ? 'text-green-400' : p.signal === 'bearish' ? 'text-red-400' : 'text-gray-300'}`}>
                {p.label}
              </div>
            ))
          )}
        </div>

        {/* Derivatives */}
        <div>
          <h4 className="text-gray-400 font-semibold mb-1">デリバティブ<HelpTip text="先物・オプション市場の情報から読み取れる、トレーダーたちの心理です" /></h4>
          <div className="text-gray-300">{derivatives.oiPriceDescription}</div>
          <div className="text-gray-400 mt-1">
            Funding: <span className={derivatives.fundingBias === 'long_heavy' ? 'text-yellow-400' : derivatives.fundingBias === 'short_heavy' ? 'text-blue-400' : 'text-gray-300'}>
              {derivatives.fundingBias === 'long_heavy' ? 'ロング偏り' : derivatives.fundingBias === 'short_heavy' ? 'ショート偏り' : '中立'}
            </span>
          </div>
        </div>

        {/* Key Indicators */}
        <div>
          <h4 className="text-gray-400 font-semibold mb-1">主要指標<HelpTip text="RSI（買われすぎ/売られすぎ）、MACD（勢い）、ADX（トレンドの強さ）を示します" /></h4>
          <div className="text-gray-300">RSI: {indicators.rsi?.toFixed(1) ?? 'N/A'}</div>
          <div className="text-gray-300">
            MACD: {indicators.macd ? (indicators.macd.histogram > 0 ? '強気' : '弱気') : 'N/A'}
          </div>
          <div className="text-gray-300">ADX: {indicators.adx?.toFixed(1) ?? 'N/A'}</div>
        </div>
      </div>
    </div>
  );
}
