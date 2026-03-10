'use client';

import { TradeSetup } from '@/lib/types';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SetupCard({ setup }: { setup: TradeSetup }) {
  const isLong = setup.direction === 'long';
  const borderColor = isLong ? 'border-green-500' : 'border-red-500';
  const label = isLong ? 'ロング' : 'ショート';
  const labelColor = isLong ? 'text-green-400' : 'text-red-400';

  return (
    <div className={`border ${borderColor} rounded-lg p-3`}>
      <h3 className={`font-bold ${labelColor} mb-2`}>{label}</h3>
      <div className="space-y-1 text-sm">
        <Row label="エントリー" value={`$${fmt(setup.entry)}`} />
        <Row label="損切り" value={`$${fmt(setup.stopLoss)}`} sub={`${setup.riskPercent}%`} subColor="text-red-400" />
        <Row label="利確" value={`$${fmt(setup.target)}`} sub={`${setup.rewardPercent}%`} subColor="text-green-400" />
        <div className="pt-1 border-t border-gray-700">
          <Row label="PR比" value={String(setup.riskRewardRatio)}
            valueColor={setup.riskRewardRatio >= 2 ? 'text-green-400' : setup.riskRewardRatio >= 1.5 ? 'text-yellow-400' : 'text-red-400'} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor = 'text-gray-200', sub, subColor }: {
  label: string; value: string; valueColor?: string; sub?: string; subColor?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono ${valueColor}`}>
        {value}
        {sub && <span className={`ml-1 text-xs ${subColor}`}>({sub})</span>}
      </span>
    </div>
  );
}

export default function PRComparison({ longSetup, shortSetup }: { longSetup: TradeSetup; shortSetup: TradeSetup }) {
  const better = longSetup.riskRewardRatio >= shortSetup.riskRewardRatio ? 'long' : 'short';

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">④ PR比較 (Long vs Short)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SetupCard setup={longSetup} />
        <SetupCard setup={shortSetup} />
      </div>
      <div className="mt-3 text-center text-sm text-gray-400">
        PR比が高い方: <span className={better === 'long' ? 'text-green-400' : 'text-red-400'}>
          {better === 'long' ? 'ロング' : 'ショート'}
        </span>
      </div>
    </div>
  );
}
