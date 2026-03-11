'use client';

import { TrendAnalysis, TimeframeAnalysis } from '@/lib/types';
import HelpTip from './HelpTip';

const LABELS: Record<string, string> = {
  uptrend: '上昇トレンド',
  downtrend: '下落トレンド',
  range: 'レンジ',
  strong: '強い',
  moderate: '普通',
  weak: '弱い',
};

const COLORS: Record<string, string> = {
  uptrend: 'bg-green-600',
  downtrend: 'bg-red-600',
  range: 'bg-yellow-600',
};

const TF_LABELS: Record<string, string> = {
  '5m': '5分足', '15m': '15分足', '1h': '1時間足', '4h': '4時間足', '1d': '日足',
};

interface Props {
  trend: TrendAnalysis;
  timeframeDetails?: TimeframeAnalysis[];
}

export default function TrendBadge({ trend, timeframeDetails }: Props) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">トレンド判定（統合）<HelpTip text="複数の時間足の分析を組み合わせた、現在の相場の方向性です" /></h2>
      <div className="flex items-center gap-3 mb-3">
        <span className={`px-3 py-1 rounded text-white font-bold ${COLORS[trend.direction]}`}>
          {LABELS[trend.direction]}
        </span>
        <span className="text-gray-400">
          強度: <span className="text-gray-200">{LABELS[trend.strength]}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div className="text-gray-400">MA配列<HelpTip text="移動平均線の並び順です。短期>中期>長期なら上昇、逆なら下落傾向" />: <span className="text-gray-200">{trend.maAlignment || 'N/A'}</span></div>
        <div className="text-gray-400">
          高値切り上げ<HelpTip text="直近の山が前の山より高くなっているかどうか。上昇トレンドの特徴です" />: <span className={trend.higherHighs ? 'text-green-400' : 'text-red-400'}>
            {trend.higherHighs ? 'はい' : 'いいえ'}
          </span>
        </div>
        <div className="text-gray-400">
          安値切り上げ<HelpTip text="直近の谷が前の谷より高くなっているかどうか。上昇トレンドの特徴です" />: <span className={trend.higherLows ? 'text-green-400' : 'text-red-400'}>
            {trend.higherLows ? 'はい' : 'いいえ'}
          </span>
        </div>
      </div>

      {/* Per-timeframe breakdown */}
      {timeframeDetails && timeframeDetails.length > 1 && (
        <div className="border-t border-gray-700 pt-3 mt-3">
          <div className="text-sm text-gray-400 mb-2">各時間足のトレンド:</div>
          <div className="flex flex-wrap gap-2">
            {timeframeDetails.map((d) => (
              <div key={d.timeframe} className="bg-gray-700 rounded px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-300">{TF_LABELS[d.timeframe] || d.timeframe}</span>
                  <span className={`text-xs font-bold ${
                    d.trend.direction === 'uptrend' ? 'text-green-400' :
                    d.trend.direction === 'downtrend' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {d.trend.direction === 'uptrend' ? '↑' : d.trend.direction === 'downtrend' ? '↓' : '→'}
                  </span>
                  <span className="text-xs text-gray-500">
                    RSI {d.indicators.rsi?.toFixed(0) ?? '-'}
                  </span>
                </div>
                {d.pullback && (
                  <div className="text-xs text-blue-400 mt-0.5">{d.pullback.depth === 'shallow' ? '浅い' : d.pullback.depth === 'moderate' ? '標準' : '深い'}押し目 ({(d.pullback.fibLevel * 100).toFixed(0)}%){d.pullback.retestDetected ? ' リテスト中' : ''}</div>
                )}
                {d.volumeBreakouts && d.volumeBreakouts.length > 0 && (
                  <div className="text-xs text-orange-400 mt-0.5">出来高ブレイク検出</div>
                )}
                {d.falseBreakouts && d.falseBreakouts.length > 0 && (
                  <div className="text-xs text-yellow-400 mt-0.5">ダマシ{d.falseBreakouts.length}件</div>
                )}
                {d.volumeSpikes && d.volumeSpikes.length > 0 && (
                  <div className="text-xs text-cyan-400 mt-0.5">出来高スパイク{d.volumeSpikes.length}件</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
