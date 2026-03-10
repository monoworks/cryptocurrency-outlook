'use client';

import { SavedPosition } from '@/lib/types';
import { useLivePrices } from '@/hooks/useLivePrice';
import HelpTip from './HelpTip';

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  positions: SavedPosition[];
  onRemove: (id: string) => void;
}

export default function PositionManager({ positions, onRemove }: Props) {
  const symbols = positions.map((p) => p.symbol);
  const livePrices = useLivePrices(symbols);

  if (positions.length === 0) return null;

  // Total P&L across all positions
  let totalPnl = 0;
  let totalInvested = 0;
  let totalInvestedAll = 0;
  let connectedCount = 0;

  for (const pos of positions) {
    totalInvestedAll += pos.amount;
    const livePrice = livePrices[pos.symbol.toUpperCase()];
    if (livePrice == null) {
      continue;
    }
    connectedCount++;
    const posSize = pos.amount * pos.leverage;
    const pnl = pos.direction === 'long'
      ? posSize * (livePrice - pos.entry) / pos.entry
      : posSize * (pos.entry - livePrice) / pos.entry;
    totalPnl += pnl;
    totalInvested += pos.amount;
  }

  const totalRoi = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">
        登録ポジション
        <HelpTip text="登録したポジションの含み損益をリアルタイムで表示します。データはブラウザに保存されます" />
        <span className="text-sm font-normal text-gray-400 ml-2">({positions.length}件)</span>
      </h2>

      {/* Total summary */}
      <div className="rounded-lg p-3 mb-4 bg-gray-700/30 border border-gray-600/30">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm text-gray-400">合計投資金額</span>
          <span className="text-white font-bold font-mono">${fmt(totalInvestedAll, 0)} USDT</span>
        </div>
        {connectedCount > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-400">
              合計含み損益
              {connectedCount < positions.length && (
                <span className="text-xs text-gray-500 ml-1">({connectedCount}/{positions.length}件接続中)</span>
              )}
            </span>
            <div className="text-right">
              <span className={`text-lg font-bold font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} USDT
              </span>
              <span className={`ml-2 text-sm font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({totalRoi >= 0 ? '+' : ''}{fmt(totalRoi)}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Position list */}
      <div className="space-y-2">
        {positions.map((pos) => (
          <PositionRow
            key={pos.id}
            position={pos}
            livePrice={livePrices[pos.symbol.toUpperCase()] ?? null}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}

function PositionRow({ position: pos, livePrice, onRemove }: {
  position: SavedPosition;
  livePrice: number | null;
  onRemove: (id: string) => void;
}) {
  const posSize = pos.amount * pos.leverage;
  const isLong = pos.direction === 'long';

  let pnl: number | null = null;
  let pnlPercent: number | null = null;
  if (livePrice != null) {
    pnl = isLong
      ? posSize * (livePrice - pos.entry) / pos.entry
      : posSize * (pos.entry - livePrice) / pos.entry;
    pnlPercent = pos.amount > 0 ? (pnl / pos.amount) * 100 : 0;
  }

  const dirLabel = isLong ? 'L' : 'S';
  const dirColor = isLong ? 'text-green-400 bg-green-900/40' : 'text-red-400 bg-red-900/40';

  return (
    <div className="flex items-center gap-2 bg-gray-750 rounded-lg p-2 border border-gray-700 text-sm">
      {/* Direction badge */}
      <span className={`${dirColor} px-1.5 py-0.5 rounded text-xs font-bold shrink-0`}>{dirLabel}</span>

      {/* Symbol & entry */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-xs">{pos.symbol}</span>
          <span className="text-gray-500 text-xs">{pos.leverage}x</span>
          <span className="text-gray-500 text-xs">${fmt(pos.amount, 0)}</span>
        </div>
        <div className="text-xs text-gray-500">
          参入 ${fmt(pos.entry)} / 損切 ${fmt(pos.stopLoss)} / 利確 ${fmt(pos.target)}
        </div>
      </div>

      {/* Live price & P&L */}
      <div className="text-right shrink-0">
        {livePrice != null ? (
          <>
            <div className="text-xs text-gray-400 font-mono">${fmt(livePrice)}</div>
            <div className={`text-sm font-bold font-mono ${pnl != null && pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pnl != null ? `${pnl >= 0 ? '+' : ''}${fmt(pnl)}` : '-'}
              {pnlPercent != null && (
                <span className="text-xs ml-1">({pnlPercent >= 0 ? '+' : ''}{fmt(pnlPercent)}%)</span>
              )}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500">接続中...</div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={() => onRemove(pos.id)}
        className="text-gray-500 hover:text-red-400 transition-colors shrink-0 p-1"
        title="削除"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
