'use client';

import { useState, useRef } from 'react';
import { AnalysisResult } from '@/lib/types';
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AnalysisHistory({ history, onLoad, onDelete, onImport, onClearAll }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // reset so same file can be re-imported
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
          <HelpTip text="過去の分析結果を保存・管理できます。JSONファイルとしてエクスポート/インポートも可能です" />
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
                return (
                  <div key={entry.id} className="flex items-center justify-between bg-gray-750 border border-gray-700 rounded-lg px-3 py-2">
                    <button
                      onClick={() => onLoad(entry)}
                      className="flex-1 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                    >
                      <span className="text-xs text-gray-500 font-mono w-24 shrink-0">{formatTimestamp(entry.timestamp)}</span>
                      <span className="text-sm font-bold text-white">{entry.symbol}</span>
                      <span className={`text-xs font-bold ${cl.color}`}>{cl.text}</span>
                      {entry.confidence != null && (
                        <span className="text-xs text-gray-500">信頼度 {entry.confidence}%</span>
                      )}
                      <span className="text-xs text-gray-500 font-mono">${entry.currentPrice.toLocaleString()}</span>
                    </button>
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="ml-2 p-1 text-gray-600 hover:text-red-400 transition-colors"
                      aria-label="削除"
                    >
                      ✕
                    </button>
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
