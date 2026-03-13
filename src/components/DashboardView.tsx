'use client';

import { AnalysisResult, EconomicCalendarAnalysis, NewsArticle, SavedPosition, CloseReason } from '@/lib/types';
import { buildAnalysisPrompt } from '@/lib/prompt-builder';
import PRComparison from './PRComparison';
import PositionSimulator from './PositionSimulator';
import PositionManager from './PositionManager';
import AnalysisHistory, { HistoryEntry } from './AnalysisHistory';
import NewsSection from './NewsSection';
import CopyPrompt from './CopyPrompt';

interface Props {
  result: AnalysisResult | null;
  currentSymbol: string;
  livePrice: number | null | undefined;
  // Economic calendar & news
  standaloneCalendar: EconomicCalendarAnalysis | null;
  news: NewsArticle[] | null;
  // Position management
  pendingPositions: SavedPosition[];
  openPositions: SavedPosition[];
  closedPositions: SavedPosition[];
  addPosition: (pos: Omit<SavedPosition, 'id' | 'createdAt' | 'status'>) => boolean;
  fillPosition: (id: string, fillPrice: number) => void;
  removePosition: (id: string) => void;
  closePosition: (id: string, currentPrice: number, reason?: CloseReason) => void;
  resetAll: () => void;
  positions: SavedPosition[];
  maxPositions: number;
  // History
  history: HistoryEntry[];
  loadFromHistory: (entry: HistoryEntry) => void;
  deleteFromHistory: (id: string) => void;
  importHistory: (entries: HistoryEntry[]) => void;
  clearHistory: () => void;
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px] text-gray-500 text-sm">
      {text}
    </div>
  );
}

export default function DashboardView({
  result,
  currentSymbol,
  livePrice,
  standaloneCalendar,
  news,
  pendingPositions,
  openPositions,
  closedPositions,
  addPosition,
  fillPosition,
  removePosition,
  closePosition,
  resetAll,
  positions,
  maxPositions,
  history,
  loadFromHistory,
  deleteFromHistory,
  importHistory,
  clearHistory,
}: Props) {
  const calendar = result?.economicCalendar ?? standaloneCalendar;

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[2fr_3fr] gap-4">
      {/* ===== Left column ===== */}
      <div className="space-y-4">
        {/* Conclusion card */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-bold text-white mb-3">結論</h2>
          {result ? (() => {
            const cfg: Record<string, { label: string; color: string; bg: string }> = {
              enter_long: { label: 'ロングエントリー推奨', color: 'text-green-400', bg: 'bg-green-900/30 border-green-500' },
              enter_short: { label: 'ショートエントリー推奨', color: 'text-red-400', bg: 'bg-red-900/30 border-red-500' },
              wait: { label: '引きつけて待機', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-500' },
              skip: { label: '見送り推奨', color: 'text-gray-400', bg: 'bg-gray-700/30 border-gray-500' },
            };
            const c = cfg[result.conclusion] ?? cfg.skip;
            return (
              <div className={`border rounded-lg p-4 ${c.bg}`}>
                <div className={`text-xl font-bold ${c.color} mb-2`}>{c.label}</div>
                <p className="text-gray-300 text-sm">{result.conclusionReason}</p>
              </div>
            );
          })() : (
            <Placeholder text="分析を実行すると結論が表示されます" />
          )}
        </div>

        {/* PR Comparison card */}
        <div className="bg-gray-800 rounded-lg p-0 overflow-hidden">
          {result ? (
            <PRComparison
              longSetup={result.longSetup}
              shortSetup={result.shortSetup}
              symbol={currentSymbol}
              livePrice={livePrice}
              vertical
            />
          ) : (
            <div className="p-4">
              <h2 className="text-lg font-bold text-white mb-3">PR比較 (Long vs Short)</h2>
              <Placeholder text="分析を実行するとPR比較が表示されます" />
            </div>
          )}
        </div>

        {/* Economic Calendar card */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-2">経済指標カレンダー</h2>
          {calendar ? (
            <>
              <div className={`text-xs ${
                calendar.warningLevel === 'danger' ? 'text-red-300'
                  : calendar.warningLevel === 'caution' ? 'text-yellow-300'
                  : 'text-gray-500'
              }`}>
                {calendar.description}
              </div>
              {calendar.events.filter((e) => e.impact === 'high' || e.impact === 'medium').length > 0 && (
                <div className="mt-2 space-y-1">
                  {calendar.events.filter((e) => e.impact === 'high' || e.impact === 'medium').slice(0, 5).map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        e.impact === 'high' ? 'bg-red-800 text-red-200' : 'bg-yellow-800 text-yellow-200'
                      }`}>
                        {e.impact === 'high' ? '高' : '中'}
                      </span>
                      <span className="text-gray-400">{e.timeJST}</span>
                      <span className="text-gray-300">{e.event}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Placeholder text="経済指標データなし" />
          )}
        </div>

        {/* News card */}
        <div className="bg-gray-800 rounded-lg p-0 overflow-hidden">
          <NewsSection articles={news} />
        </div>
      </div>

      {/* ===== Right column ===== */}
      <div className="space-y-4">
        {/* Position Simulator card */}
        <div className="bg-gray-800 rounded-lg p-0 overflow-hidden">
          {result ? (
            <PositionSimulator
              longSetup={result.longSetup}
              shortSetup={result.shortSetup}
              symbol={currentSymbol}
              onSavePosition={addPosition}
              positionCount={positions.length}
              maxPositions={maxPositions}
            />
          ) : (
            <div className="p-4">
              <h2 className="text-lg font-bold text-white mb-3">売買シミュレーター</h2>
              <Placeholder text="分析を実行するとシミュレーターが使用可能になります" />
            </div>
          )}
        </div>

        {/* Position Manager card */}
        <div className="bg-gray-800 rounded-lg p-0 overflow-hidden max-h-[300px] overflow-y-auto">
          {(pendingPositions.length + openPositions.length + closedPositions.length) > 0 ? (
            <PositionManager
              pendingPositions={pendingPositions}
              openPositions={openPositions}
              closedPositions={closedPositions}
              onRemove={removePosition}
              onFill={fillPosition}
              onClose={closePosition}
              onResetAll={resetAll}
            />
          ) : (
            <div className="p-4">
              <h2 className="text-lg font-bold text-white mb-3">ポジション管理</h2>
              <Placeholder text="登録されたポジションはありません" />
            </div>
          )}
        </div>

        {/* Analysis History card */}
        <div className="bg-gray-800 rounded-lg p-0 overflow-hidden max-h-[300px] overflow-y-auto">
          {history.length > 0 ? (
            <AnalysisHistory
              history={history}
              onLoad={loadFromHistory}
              onDelete={deleteFromHistory}
              onImport={importHistory}
              onClearAll={clearHistory}
            />
          ) : (
            <div className="p-4">
              <h2 className="text-lg font-bold text-white mb-3">分析履歴</h2>
              <Placeholder text="分析を実行すると履歴が保存されます" />
            </div>
          )}
        </div>

        {/* Copy Prompt (only when result exists) */}
        {result && (
          <CopyPrompt prompt={buildAnalysisPrompt(result)} />
        )}
      </div>
    </div>
  );
}
