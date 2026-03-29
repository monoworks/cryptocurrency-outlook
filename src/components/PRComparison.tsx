'use client';

import { TradeSetup } from '@/lib/types';
import HelpTip from './HelpTip';

function fmt(n: number): string {
  // 価格帯に応じて小数桁数を調整
  const decimals = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
        <Row label="エントリー" help={isLong ? '押し目買い: サポート付近での指値エントリー' : '戻り売り: レジスタンス付近での指値エントリー'} value={`$${fmt(setup.entry)}`} />
        <Row label="損切り" help="損失を限定するために手放す価格。これ以上の損失を防ぐ安全ラインです" value={`$${fmt(setup.stopLoss)}`} sub={`${setup.riskPercent}%`} subColor="text-red-400" />
        <Row label="利確" help="利益を確定させるための目標価格です" value={`$${fmt(setup.target)}`} sub={`${setup.rewardPercent}%`} subColor="text-green-400" />
        <div className="pt-1 border-t border-gray-700">
          <Row label="PR比" value={String(setup.riskRewardRatio)}
            valueColor={setup.riskRewardRatio >= 2 ? 'text-green-400' : setup.riskRewardRatio >= 1.5 ? 'text-yellow-400' : 'text-red-400'} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, help, value, valueColor = 'text-gray-200', sub, subColor }: {
  label: string; help?: string; value: string; valueColor?: string; sub?: string; subColor?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}{help && <HelpTip text={help} />}</span>
      <span className={`font-mono ${valueColor}`}>
        {value}
        {sub && <span className={`ml-1 text-xs ${subColor}`}>({sub})</span>}
      </span>
    </div>
  );
}

export default function PRComparison({ longSetup, shortSetup, symbol, livePrice, vertical }: { longSetup: TradeSetup; shortSetup: TradeSetup; symbol?: string; livePrice?: number | null; vertical?: boolean }) {
  const isEqual = longSetup.riskRewardRatio === shortSetup.riskRewardRatio;
  const better = longSetup.riskRewardRatio > shortSetup.riskRewardRatio ? 'long' : 'short';

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-1">PR比較 (Long vs Short)<HelpTip text="指値ベースのPR比較です。ロングは押し目（サポート付近）、ショートは戻り（レジスタンス付近）でのエントリーを想定しています。PR比は利益÷リスクで、2以上が理想的です" /></h2>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-400">現在価格{symbol ? ` (${symbol})` : ''}:</span>
        <span className="text-lg font-bold font-mono text-yellow-400">
          {livePrice != null
            ? `$${fmt(livePrice)}`
            : '接続中...'}
        </span>
      </div>
      <div className={`grid gap-3 ${vertical ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        <SetupCard setup={longSetup} />
        <SetupCard setup={shortSetup} />
      </div>
      <div className="mt-3 text-center text-sm text-gray-400">
        {isEqual ? (
          <>PR比: <span className="text-yellow-400">同値</span></>
        ) : (
          <>PR比が高い方: <span className={better === 'long' ? 'text-green-400' : 'text-red-400'}>
            {better === 'long' ? 'ロング' : 'ショート'}
          </span></>
        )}
      </div>
    </div>
  );
}
