'use client';

import { useState, useRef, useMemo } from 'react';
import { AnalysisResult, Timeframe } from '@/lib/types';
import { useLivePrices } from '@/hooks/useLivePrice';
import HelpTip from './HelpTip';

export interface HistoryEntry {
  id: string;
  timestamp: string;       // ISO string
  symbol: string;
  conclusion: string;
  currentPrice: number;
  confidence?: number;
  result: AnalysisResult;
}

interface Props {
  history: HistoryEntry[];
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onImport: (entries: HistoryEntry[]) => void;
  onClearAll: () => void;
}

const conclusionLabel: Record<string, { text: string; color: string }> = {
  enter_long: { text: 'ロング', color: 'text-green-400' },
  enter_short: { text: 'ショート', color: 'text-red-400' },
  wait: { text: '様子見', color: 'text-yellow-400' },
  skip: { text: 'スキップ', color: 'text-gray-400' },
};

/** Fallback: map the longest timeframe to an evaluation window (hours) for legacy entries */
const tfEvalHoursFallback: Record<Timeframe, number> = {
  '1m': 0.5,
  '5m': 2,
  '15m': 4,
  '1h': 8,
  '4h': 24,
  '1d': 120,
};

/**
 * Get evaluation window in hours from the analysis result.
 * Primary: use suggestedMaxHoldingMs (weighted average of timeframe combination).
 * Fallback: use longest timeframe mapping for legacy entries without holding data.
 */
function getEvalWindowHours(result: AnalysisResult): number {
  // Use the conclusion-relevant setup's holding time if available
  const holdingMs = result.longSetup?.suggestedMaxHoldingMs ?? result.shortSetup?.suggestedMaxHoldingMs;
  if (holdingMs && holdingMs > 0) {
    return holdingMs / (1000 * 60 * 60);
  }
  // Fallback for legacy entries
  const timeframes = result.marketSummary?.timeframes ?? [];
  let max = 2;
  for (const tf of timeframes) {
    const h = tfEvalHoursFallback[tf];
    if (h && h > max) max = h;
  }
  return max;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRemainingTime(hours: number): string {
  if (hours < 1) return `${Math.ceil(hours * 60)}分`;
  return `${Math.floor(hours)}時間`;
}

/** Evaluate whether the signal was correct based on price movement */
function evaluateResult(conclusion: string, changePct: number): { label: string; color: string; bg: string } {
  if (conclusion === 'enter_long') {
    if (changePct > 1) return { label: '的中', color: 'text-green-400', bg: 'bg-green-900/40' };
    if (changePct < -1) return { label: '外れ', color: 'text-red-400', bg: 'bg-red-900/40' };
    return { label: '判定中', color: 'text-gray-500', bg: 'bg-gray-700/40' };
  }
  if (conclusion === 'enter_short') {
    if (changePct < -1) return { label: '的中', color: 'text-green-400', bg: 'bg-green-900/40' };
    if (changePct > 1) return { label: '外れ', color: 'text-red-400', bg: 'bg-red-900/40' };
    return { label: '判定中', color: 'text-gray-500', bg: 'bg-gray-700/40' };
  }
  // wait / skip
  if (Math.abs(changePct) < 2) return { label: '正解', color: 'text-green-400', bg: 'bg-green-900/40' };
  return { label: '機会損失', color: 'text-yellow-400', bg: 'bg-yellow-900/40' };
}

export default function AnalysisHistory({ history, onLoad, onDelete, onImport, onClearAll }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get unique symbols from history for live price tracking
  const symbols = useMemo(() => {
    if (!expanded) return [];
    return Array.from(new Set(history.map((e) => e.symbol)));
  }, [expanded, history]);

  const livePrices = useLivePrices(symbols);

  const handleExport = () => {
    const json = JSON.stringify(history, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crypto-outlook-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].result) {
          onImport(data);
        }
      } catch {
        // invalid file
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    onClearAll();
    setConfirmClear(false);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-bold text-white hover:text-gray-300 transition-colors"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          分析履歴（{history.length}件）
          <HelpTip text="過去の分析結果を保存し、現在価格との比較で的中/外れを自動判定します。判定期間は選択した時間足の組み合わせから算出した推奨保有時間に連動します。期間を過ぎると期限切れになります" />
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={history.length === 0}
            className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            エクスポート
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            インポート
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {history.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">分析を実行すると履歴が保存されます</p>
          ) : (
            <>
              {history.map((entry) => {
                const cl = conclusionLabel[entry.conclusion] ?? { text: entry.conclusion, color: 'text-gray-400' };
                const nowPrice = livePrices[entry.symbol.toUpperCase()];
                const changePct = nowPrice ? ((nowPrice - entry.currentPrice) / entry.currentPrice) * 100 : null;

                // Determine evaluation window from timeframes used
                const evalWindowH = entry.result ? getEvalWindowHours(entry.result) : 4;
                const elapsedMs = Date.now() - new Date(entry.timestamp).getTime();
                const elapsedH = elapsedMs / (1000 * 60 * 60);
                const isExpired = elapsedH > evalWindowH;
                const remainingH = evalWindowH - elapsedH;

                const evaluation = (!isExpired && changePct !== null) ? evaluateResult(entry.conclusion, changePct) : null;

                return (
                  <div key={entry.id} className={`border rounded-lg px-3 py-2 ${isExpired ? 'border-gray-700/50 opacity-60' : 'border-gray-700'}`}>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => onLoad(entry)}
                        className="flex-1 text-left hover:opacity-80 transition-opacity"
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-gray-500 font-mono shrink-0">{formatTimestamp(entry.timestamp)}</span>
                          <span className="text-sm font-bold text-white">{entry.symbol}</span>
                          <span className={`text-xs font-bold ${cl.color}`}>{cl.text}</span>
                          {entry.confidence != null && (
                            <span className="text-xs text-gray-500">信頼度 {entry.confidence}%</span>
                          )}
                          {isExpired ? (
                            <span className="text-[10px] text-gray-600 px-1.5 py-0.5 rounded bg-gray-700/40">期限切れ</span>
                          ) : (
                            <span className="text-[10px] text-gray-600">残り{formatRemainingTime(remainingH)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500 font-mono">
                            分析時 ${entry.currentPrice.toLocaleString()}
                          </span>
                          {nowPrice != null && changePct !== null && (
                            <>
                              <span className="text-xs text-gray-600">→</span>
                              <span className="text-xs font-mono text-gray-400">
                                現在 ${nowPrice.toLocaleString()}
                              </span>
                              <span className={`text-xs font-bold font-mono ${changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                              </span>
                              {evaluation && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${evaluation.color} ${evaluation.bg}`}>
                                  {evaluation.label}
                                </span>
                              )}
                              {isExpired && (
                                <span className="text-xs text-gray-600 font-mono">
                                  最終 {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                                </span>
                              )}
                            </>
                          )}
                          {nowPrice == null && (
                            <span className="text-xs text-gray-600">価格取得中...</span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="ml-2 p-1 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                        aria-label="削除"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleClearAll}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    confirmClear
                      ? 'bg-red-600 text-white'
                      : 'text-gray-500 hover:text-red-400'
                  }`}
                >
                  {confirmClear ? '本当に全削除する？' : '全削除'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
