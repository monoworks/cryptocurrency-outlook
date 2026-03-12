'use client';

import { useEffect, useRef, useState } from 'react';
import { SavedPosition, CloseReason } from '@/lib/types';
import { useLivePrices } from '@/hooks/useLivePrice';
import HelpTip from './HelpTip';

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function closeReasonLabel(reason?: CloseReason): string {
  if (!reason) return '';
  switch (reason) {
    case 'stop_loss': return '損切り';
    case 'take_profit': return '利確';
    case 'manual': return '手動決済';
    case 'timeout': return '時間決済';
  }
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return '期限超過';
  const totalMin = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}日${remHours}時間` : `${days}日`;
  }
  if (hours > 0) return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`;
  return `${mins}分`;
}

interface Props {
  pendingPositions: SavedPosition[];
  openPositions: SavedPosition[];
  closedPositions: SavedPosition[];
  onRemove: (id: string) => void;
  onFill: (id: string, fillPrice: number) => void;
  onClose: (id: string, currentPrice: number, reason?: CloseReason) => void;
  onResetAll: () => void;
}

export default function PositionManager({ pendingPositions, openPositions, closedPositions, onRemove, onFill, onClose, onResetAll }: Props) {
  // Collect all symbols that need live prices (pending + open)
  const activePositions = [...pendingPositions, ...openPositions];
  const symbols = activePositions.map((p) => p.symbol);
  const livePrices = useLivePrices(symbols);

  // Track which positions have already been auto-processed to avoid duplicate triggers
  const processedRef = useRef<Set<string>>(new Set());

  // Tick every minute so remaining-time display updates
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const hasTimeout = openPositions.some((p) => p.maxHoldingMs && p.filledAt);
    if (!hasTimeout) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [openPositions]);

  // Auto-fill pending orders and auto-trigger SL/TP
  useEffect(() => {
    // Check pending positions for entry fill
    for (const pos of pendingPositions) {
      const livePrice = livePrices[pos.symbol.toUpperCase()];
      if (livePrice == null) continue;
      if (processedRef.current.has(`fill-${pos.id}`)) continue;

      // Long: entry is filled when price drops to or below entry
      // Short: entry is filled when price rises to or above entry
      const shouldFill = pos.direction === 'long'
        ? livePrice <= pos.entry
        : livePrice >= pos.entry;

      if (shouldFill) {
        processedRef.current.add(`fill-${pos.id}`);
        onFill(pos.id, pos.entry);
      }
    }

    // Check open positions for SL/TP
    for (const pos of openPositions) {
      const livePrice = livePrices[pos.symbol.toUpperCase()];
      if (livePrice == null) continue;
      if (processedRef.current.has(`close-${pos.id}`)) continue;

      if (pos.direction === 'long') {
        if (livePrice <= pos.stopLoss) {
          processedRef.current.add(`close-${pos.id}`);
          onClose(pos.id, pos.stopLoss, 'stop_loss');
        } else if (livePrice >= pos.target) {
          processedRef.current.add(`close-${pos.id}`);
          onClose(pos.id, pos.target, 'take_profit');
        }
      } else {
        // Short
        if (livePrice >= pos.stopLoss) {
          processedRef.current.add(`close-${pos.id}`);
          onClose(pos.id, pos.stopLoss, 'stop_loss');
        } else if (livePrice <= pos.target) {
          processedRef.current.add(`close-${pos.id}`);
          onClose(pos.id, pos.target, 'take_profit');
        }
      }

      // Time-based auto-close: if maxHoldingMs is set and exceeded
      if (pos.maxHoldingMs && pos.filledAt) {
        const elapsed = Date.now() - pos.filledAt;
        if (elapsed >= pos.maxHoldingMs) {
          if (!processedRef.current.has(`close-${pos.id}`)) {
            processedRef.current.add(`close-${pos.id}`);
            onClose(pos.id, livePrice, 'timeout');
          }
        }
      }
    }
  }, [livePrices, pendingPositions, openPositions, onFill, onClose]);

  const totalCount = pendingPositions.length + openPositions.length + closedPositions.length;
  if (totalCount === 0) return null;

  // Unrealized P&L for open positions
  let totalUnrealizedPnl = 0;
  let totalOpenInvested = 0;
  let connectedCount = 0;

  for (const pos of openPositions) {
    const livePrice = livePrices[pos.symbol.toUpperCase()];
    if (livePrice == null) continue;
    connectedCount++;
    const posSize = pos.amount * pos.leverage;
    const pnl = pos.direction === 'long'
      ? posSize * (livePrice - pos.entry) / pos.entry
      : posSize * (pos.entry - livePrice) / pos.entry;
    totalUnrealizedPnl += pnl;
    totalOpenInvested += pos.amount;
  }
  const unrealizedRoi = totalOpenInvested > 0 ? (totalUnrealizedPnl / totalOpenInvested) * 100 : 0;

  // Realized P&L for closed positions
  let totalRealizedPnl = 0;
  let totalClosedInvested = 0;
  for (const pos of closedPositions) {
    totalRealizedPnl += pos.closedPnl ?? 0;
    totalClosedInvested += pos.amount;
  }
  const realizedRoi = totalClosedInvested > 0 ? (totalRealizedPnl / totalClosedInvested) * 100 : 0;

  const totalInvestedAll = activePositions.reduce((s, p) => s + p.amount, 0)
    + closedPositions.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">
          シミュレーションの登録ポジション
          <HelpTip text="指値注文としてポジションを登録します。価格がエントリー価格に達すると約定し、損切り/利確価格で自動決済されます" />
          <span className="text-sm font-normal text-gray-400 ml-2">({totalCount}件)</span>
        </h2>
        <button
          onClick={onResetAll}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors border border-gray-600 hover:border-red-500/50 rounded px-2 py-1"
          title="全ポジションを削除"
        >
          リセット
        </button>
      </div>

      {/* Summary */}
      <div className="rounded-lg p-3 mb-4 bg-gray-700/30 border border-gray-600/30 space-y-1">
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-gray-400">合計投資金額</span>
          <span className="text-white font-bold font-mono">${fmt(totalInvestedAll, 0)} USDT</span>
        </div>
        {connectedCount > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-400">
              含み損益
              {connectedCount < openPositions.length && (
                <span className="text-xs text-gray-500 ml-1">({connectedCount}/{openPositions.length}件接続中)</span>
              )}
            </span>
            <div className="text-right">
              <span className={`font-bold font-mono ${totalUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}{fmt(totalUnrealizedPnl)} USDT
              </span>
              <span className={`ml-2 text-sm font-mono ${totalUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({unrealizedRoi >= 0 ? '+' : ''}{fmt(unrealizedRoi)}%)
              </span>
            </div>
          </div>
        )}
        {closedPositions.length > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-400">確定損益 ({closedPositions.length}件)</span>
            <div className="text-right">
              <span className={`font-bold font-mono ${totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalRealizedPnl >= 0 ? '+' : ''}{fmt(totalRealizedPnl)} USDT
              </span>
              <span className={`ml-2 text-sm font-mono ${totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({realizedRoi >= 0 ? '+' : ''}{fmt(realizedRoi)}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Pending positions */}
      {pendingPositions.length > 0 && (
        <div className="space-y-2 mb-3">
          <h3 className="text-xs text-yellow-500 font-medium uppercase tracking-wider">待機中 ({pendingPositions.length})</h3>
          {pendingPositions.map((pos) => (
            <PendingPositionRow
              key={pos.id}
              position={pos}
              livePrice={livePrices[pos.symbol.toUpperCase()] ?? null}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      {/* Open positions */}
      {openPositions.length > 0 && (
        <div className="space-y-2 mb-3">
          <h3 className="text-xs text-blue-400 font-medium uppercase tracking-wider">オープン ({openPositions.length})</h3>
          {openPositions.map((pos) => (
            <OpenPositionRow
              key={pos.id}
              position={pos}
              livePrice={livePrices[pos.symbol.toUpperCase()] ?? null}
              now={now}
              onRemove={onRemove}
              onClose={onClose}
            />
          ))}
        </div>
      )}

      {/* Closed positions */}
      {closedPositions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-gray-500 font-medium uppercase tracking-wider">決済済み ({closedPositions.length})</h3>
          {closedPositions.map((pos) => (
            <ClosedPositionRow key={pos.id} position={pos} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingPositionRow({ position: pos, livePrice, onRemove }: {
  position: SavedPosition;
  livePrice: number | null;
  onRemove: (id: string) => void;
}) {
  const isLong = pos.direction === 'long';
  const dirLabel = isLong ? 'L' : 'S';
  const dirColor = isLong ? 'text-green-400 bg-green-900/40' : 'text-red-400 bg-red-900/40';

  // Distance to entry
  let distanceLabel = '';
  if (livePrice != null) {
    const dist = ((pos.entry - livePrice) / livePrice) * 100;
    distanceLabel = `現在 $${fmt(livePrice)} (${dist >= 0 ? '+' : ''}${fmt(dist)}%)`;
  }

  return (
    <div className="flex items-center gap-2 bg-gray-750 rounded-lg p-2 border border-yellow-700/30 text-sm">
      <span className={`${dirColor} px-1.5 py-0.5 rounded text-xs font-bold shrink-0`}>{dirLabel}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-xs">{pos.symbol}</span>
          <span className="text-gray-500 text-xs">{pos.leverage}x</span>
          <span className="text-gray-500 text-xs">${fmt(pos.amount, 0)}</span>
          <span className="text-yellow-500/80 text-xs px-1.5 py-0.5 bg-yellow-900/30 rounded">指値待ち</span>
        </div>
        <div className="text-xs text-gray-500">
          エントリー ${fmt(pos.entry)} / 損切 ${fmt(pos.stopLoss)} / 利確 ${fmt(pos.target)}
        </div>
      </div>

      <div className="text-right shrink-0">
        {livePrice != null ? (
          <div className="text-xs text-gray-400 font-mono">{distanceLabel}</div>
        ) : (
          <div className="text-xs text-gray-500">接続中...</div>
        )}
      </div>

      {/* Cancel button */}
      <button
        onClick={() => onRemove(pos.id)}
        className="text-xs text-gray-400 hover:text-red-400 border border-gray-600 hover:border-red-500/50 rounded px-1.5 py-0.5 transition-colors shrink-0"
        title="注文キャンセル"
      >
        取消
      </button>
    </div>
  );
}

function OpenPositionRow({ position: pos, livePrice, now, onRemove, onClose }: {
  position: SavedPosition;
  livePrice: number | null;
  now: number;
  onRemove: (id: string) => void;
  onClose: (id: string, currentPrice: number, reason?: CloseReason) => void;
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
      <span className={`${dirColor} px-1.5 py-0.5 rounded text-xs font-bold shrink-0`}>{dirLabel}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-xs">{pos.symbol}</span>
          <span className="text-gray-500 text-xs">{pos.leverage}x</span>
          <span className="text-gray-500 text-xs">${fmt(pos.amount, 0)}</span>
          {pos.filledAt && <span className="text-gray-600 text-xs">約定 {fmtDate(pos.filledAt)}</span>}
          {pos.maxHoldingMs && pos.filledAt && (() => {
            const remaining = pos.maxHoldingMs - (now - pos.filledAt);
            const ratio = remaining / pos.maxHoldingMs;
            const isWarning = ratio <= 0.2;
            const isExpired = remaining <= 0;
            return (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                isExpired ? 'text-red-400 bg-red-900/40 animate-pulse' :
                isWarning ? 'text-yellow-400 bg-yellow-900/30' :
                'text-gray-400 bg-gray-700/50'
              }`}>
                {isExpired ? '期限超過' : `残 ${fmtDuration(remaining)}`}
              </span>
            );
          })()}
        </div>
        <div className="text-xs text-gray-500">
          参入 ${fmt(pos.entry)} / 損切 ${fmt(pos.stopLoss)} / 利確 ${fmt(pos.target)}
        </div>
      </div>

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

      {/* Close button */}
      {livePrice != null && (
        <button
          onClick={() => onClose(pos.id, livePrice, 'manual')}
          className="text-xs text-yellow-500 hover:text-yellow-400 border border-yellow-600/50 hover:border-yellow-500 rounded px-1.5 py-0.5 transition-colors shrink-0"
          title="現在価格で決済"
        >
          決済
        </button>
      )}

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

function ClosedPositionRow({ position: pos, onRemove }: {
  position: SavedPosition;
  onRemove: (id: string) => void;
}) {
  const isLong = pos.direction === 'long';
  const dirLabel = isLong ? 'L' : 'S';
  const pnl = pos.closedPnl ?? 0;
  const pnlPercent = pos.amount > 0 ? (pnl / pos.amount) * 100 : 0;
  const reason = closeReasonLabel(pos.closeReason);

  return (
    <div className="flex items-center gap-2 bg-gray-750 rounded-lg p-2 border border-gray-700/50 text-sm opacity-70">
      <span className="text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded text-xs font-bold shrink-0">{dirLabel}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 font-medium text-xs">{pos.symbol}</span>
          <span className="text-gray-500 text-xs">{pos.leverage}x</span>
          <span className="text-gray-500 text-xs">${fmt(pos.amount, 0)}</span>
          {reason && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              pos.closeReason === 'take_profit' ? 'text-green-400 bg-green-900/30' :
              pos.closeReason === 'stop_loss' ? 'text-red-400 bg-red-900/30' :
              pos.closeReason === 'timeout' ? 'text-yellow-400 bg-yellow-900/30' :
              'text-gray-400 bg-gray-700'
            }`}>{reason}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          参入 ${fmt(pos.entry)} → 決済 ${fmt(pos.closedPrice ?? 0)}
          <span className="text-gray-600 ml-2">{pos.closedAt ? fmtDate(pos.closedAt) : ''}</span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className={`text-sm font-bold font-mono ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl >= 0 ? '+' : ''}{fmt(pnl)}
          <span className="text-xs ml-1">({pnlPercent >= 0 ? '+' : ''}{fmt(pnlPercent)}%)</span>
        </div>
      </div>

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
