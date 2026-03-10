'use client';

import { BreakoutLevel } from '@/lib/types';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BreakoutLevels({ levels }: { levels: BreakoutLevel[] }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">⑤ 重要分岐点</h2>
      {levels.length === 0 ? (
        <p className="text-gray-500 text-sm">分岐点が検出されませんでした</p>
      ) : (
        <div className="space-y-2">
          {levels.map((level, i) => {
            const isBullish = level.direction === 'bullish_above';
            return (
              <div key={i} className={`flex items-start gap-3 p-2 rounded ${isBullish ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
                <span className={`text-lg ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
                  {isBullish ? '▲' : '▼'}
                </span>
                <div>
                  <span className="font-mono text-white">${fmt(level.price)}</span>
                  <span className="ml-2 text-sm text-gray-400">{level.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
