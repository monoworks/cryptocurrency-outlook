'use client';

import { PriceLevel } from '@/lib/types';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SRLevels({ levels, currentPrice }: { levels: PriceLevel[]; currentPrice: number }) {
  const resistances = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);
  const supports = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">③ サポート / レジスタンス</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm text-red-400 font-semibold mb-2">レジスタンス</h3>
          {resistances.length === 0 ? (
            <p className="text-gray-500 text-sm">検出なし</p>
          ) : (
            <div className="space-y-1">
              {resistances.map((r, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-red-300 font-mono">${fmt(r.price)}</span>
                  <span className="text-gray-400">
                    {Array(r.strength).fill('■').join('')}{Array(5 - r.strength).fill('□').join('')}
                    <span className="ml-2">({r.touchCount}回)</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="text-sm text-green-400 font-semibold mb-2">サポート</h3>
          {supports.length === 0 ? (
            <p className="text-gray-500 text-sm">検出なし</p>
          ) : (
            <div className="space-y-1">
              {supports.map((s, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-green-300 font-mono">${fmt(s.price)}</span>
                  <span className="text-gray-400">
                    {Array(s.strength).fill('■').join('')}{Array(5 - s.strength).fill('□').join('')}
                    <span className="ml-2">({s.touchCount}回)</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-500 text-center">
        現在価格: <span className="text-white font-mono">${fmt(currentPrice)}</span>
      </div>
    </div>
  );
}
