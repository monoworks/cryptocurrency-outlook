'use client';

import { TrendAnalysis } from '@/lib/types';

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

export default function TrendBadge({ trend }: { trend: TrendAnalysis }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">② トレンド判定</h2>
      <div className="flex items-center gap-3 mb-3">
        <span className={`px-3 py-1 rounded text-white font-bold ${COLORS[trend.direction]}`}>
          {LABELS[trend.direction]}
        </span>
        <span className="text-gray-400">
          強度: <span className="text-gray-200">{LABELS[trend.strength]}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-gray-400">MA配列: <span className="text-gray-200">{trend.maAlignment || 'N/A'}</span></div>
        <div className="text-gray-400">
          高値切り上げ: <span className={trend.higherHighs ? 'text-green-400' : 'text-red-400'}>
            {trend.higherHighs ? 'はい' : 'いいえ'}
          </span>
        </div>
        <div className="text-gray-400">
          安値切り上げ: <span className={trend.higherLows ? 'text-green-400' : 'text-red-400'}>
            {trend.higherLows ? 'はい' : 'いいえ'}
          </span>
        </div>
      </div>
    </div>
  );
}
