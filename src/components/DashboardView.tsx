'use client';

import { useState, useMemo } from 'react';
import { AnalysisResult, EconomicCalendarAnalysis, NewsArticle, WhaleActivity, SavedPosition, CloseReason } from '@/lib/types';
import PRComparison from './PRComparison';
import PositionSimulator from './PositionSimulator';
import PositionManager from './PositionManager';
import NewsSection from './NewsSection';
import HyperliquidChart from './HyperliquidChart';
import { analyzeNews } from '@/lib/news';
import { determineNewsAdjustedConclusion } from '@/lib/signal';

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
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[60px] text-gray-500 text-sm">
      {text}
    </div>
  );
}

/* ── Inline header badges for 経済指標 & ニュース ── */
function CalendarBadge({ calendar }: { calendar: EconomicCalendarAnalysis | null }) {
  const [open, setOpen] = useState(false);
  if (!calendar) return null;

  const events = calendar.events;
  const highCount = events.filter((e) => e.impact === 'high').length;
  const medCount = events.filter((e) => e.impact === 'medium').length;

  const color = calendar.warningLevel === 'danger' ? 'text-red-400 border-red-500'
    : calendar.warningLevel === 'caution' ? 'text-yellow-400 border-yellow-500'
    : 'text-gray-400 border-gray-600';
  const icon = calendar.warningLevel === 'danger' ? '🔴'
    : calendar.warningLevel === 'caution' ? '🟡' : '🟢';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 ${color} bg-gray-800 hover:bg-gray-700 transition-colors`}
      >
        <span>{icon}</span>
        <span>経済指標</span>
        {highCount > 0 && <span className="text-red-400 font-bold">高{highCount}</span>}
        {medCount > 0 && <span className="text-yellow-400 font-bold">中{medCount}</span>}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-80 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl">
          <div className={`text-xs mb-2 ${
            calendar.warningLevel === 'danger' ? 'text-red-300'
              : calendar.warningLevel === 'caution' ? 'text-yellow-300' : 'text-gray-400'
          }`}>
            {calendar.description}
          </div>
          {calendar.events.filter((e) => e.impact === 'high' || e.impact === 'medium').length > 0 && (
            <div className="space-y-1">
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
        </div>
      )}
    </div>
  );
}

function NewsBadge({ articles }: { articles: NewsArticle[] | null }) {
  const [open, setOpen] = useState(false);
  const list = articles ?? [];

  const geoCount = list.filter((a) => a.tag === 'geopolitical').length;
  const highCount = list.filter((a) => a.impact === 'high').length;
  const hasAlert = geoCount > 0 || highCount > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 transition-colors ${
          hasAlert
            ? 'border-orange-600/60 text-orange-400 bg-orange-900/20 hover:bg-orange-900/30'
            : 'border-gray-600 text-gray-400 bg-gray-800 hover:bg-gray-700'
        }`}
      >
        <span>{hasAlert ? '⚠️' : '📰'}</span>
        <span>ニュース ({list.length})</span>
        {geoCount > 0 && <span className="text-orange-400 font-bold">地政学{geoCount}</span>}
        {highCount > 0 && <span className="text-red-400 font-bold">高影響{highCount}</span>}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-96 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          <NewsSection articles={articles} />
        </div>
      )}
    </div>
  );
}

function WhaleBadge({ whale }: { whale: WhaleActivity | undefined }) {
  const [open, setOpen] = useState(false);
  if (!whale) return null;

  const hasActivity = whale.largeTradeCount > 0 || whale.walls.length > 0;
  const color = whale.signal === 'accumulation' ? 'border-green-600/60 text-green-400 bg-green-900/20 hover:bg-green-900/30'
    : whale.signal === 'distribution' ? 'border-red-600/60 text-red-400 bg-red-900/20 hover:bg-red-900/30'
    : 'border-gray-600 text-gray-400 bg-gray-800 hover:bg-gray-700';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 transition-colors ${color}`}
      >
        <span>{whale.signal === 'accumulation' ? '🐋' : whale.signal === 'distribution' ? '🔴' : '🐳'}</span>
        <span>大口動向</span>
        {whale.largeTradeCount > 0 && <span className="font-bold">{whale.largeTradeCount}件</span>}
        {whale.signal !== 'neutral' && (
          <span className="font-bold">{whale.signal === 'accumulation' ? '蓄積' : '分配'}</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-96 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl">
          <div className="text-xs text-gray-300 mb-2">{whale.description}</div>
          {hasActivity && (
            <div className="space-y-2">
              {whale.largeTrades.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 font-semibold mb-1">直近の大口約定</div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {whale.largeTrades.slice(0, 10).map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                          t.side === 'buy' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'
                        }`}>
                          {t.side === 'buy' ? '買' : '売'}
                        </span>
                        <span className="text-gray-400">${t.price.toLocaleString()}</span>
                        <span className="text-gray-300">${(t.quoteQty / 1000).toFixed(0)}K</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {whale.walls.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 font-semibold mb-1">板の大口壁</div>
                  <div className="space-y-0.5">
                    {whale.walls.slice(0, 6).map((w, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                          w.side === 'bid' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'
                        }`}>
                          {w.side === 'bid' ? '買壁' : '売壁'}
                        </span>
                        <span className="text-gray-400">${w.price.toLocaleString()}</span>
                        <span className="text-gray-300">${(w.quoteQty / 1000).toFixed(0)}K</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
}: Props) {
  const calendar = result?.economicCalendar ?? standaloneCalendar;

  // Fallback: if result lacks newsAdjusted but we have news articles, compute it client-side
  const newsAdjusted = useMemo(() => {
    if (result?.newsAdjustedConclusion && result?.newsAdjustedReason) {
      return { conclusion: result.newsAdjustedConclusion, reason: result.newsAdjustedReason };
    }
    if (!result || !news || news.length === 0) return null;
    const analysis = analyzeNews(news);
    if (!analysis) return null;
    return determineNewsAdjustedConclusion(result.conclusion, result.conclusionReason, analysis) ?? null;
  }, [result, news]);

  return (
    <div className="flex flex-col gap-3">
      {/* ===== Row 0: Header badges (経済指標 + ニュース) ===== */}
      <div className="flex items-center gap-2 justify-start flex-wrap">
        <CalendarBadge calendar={calendar} />
        <NewsBadge articles={news} />
        <WhaleBadge whale={result?.whaleActivity} />
      </div>

      {/* ===== Row 1: Main content — Left (結論+PR比較) | Right (売買シミュレーター) ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-3">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          {/* Conclusion card */}
          <div className="bg-gray-800 rounded-lg p-3">
            <h2 className="text-base font-bold text-white mb-2">結論（テクニカル分析のみ）</h2>
            {result ? (() => {
              const cfg: Record<string, { label: string; color: string; bg: string }> = {
                enter_long: { label: 'ロングエントリー推奨', color: 'text-green-400', bg: 'bg-green-900/30 border-green-500' },
                enter_short: { label: 'ショートエントリー推奨', color: 'text-red-400', bg: 'bg-red-900/30 border-red-500' },
                wait: { label: '引きつけて待機', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-500' },
                skip: { label: '見送り推奨', color: 'text-gray-400', bg: 'bg-gray-700/30 border-gray-500' },
              };
              const c = cfg[result.conclusion] ?? cfg.skip;
              const nc = newsAdjusted ? (cfg[newsAdjusted.conclusion] ?? cfg.skip) : null;
              const wc = result.whaleAdjustedConclusion ? (cfg[result.whaleAdjustedConclusion] ?? cfg.skip) : null;
              return (
                <>
                  <div className={`border rounded-lg p-3 ${c.bg}`}>
                    <div className={`text-lg font-bold ${c.color} mb-1`}>{c.label}</div>
                    <p className="text-gray-300 text-sm">{result.conclusionReason}</p>
                  </div>
                  {nc && newsAdjusted && (
                    <div className="mt-3">
                      <h2 className="text-base font-bold text-white mb-2">結論（ニュース要素加味 <span className="text-xs font-normal text-gray-400">※試行中</span>）</h2>
                      <div className={`border rounded-lg p-3 ${nc.bg}`}>
                        <div className={`text-lg font-bold ${nc.color} mb-1`}>{nc.label}</div>
                        <p className="text-gray-300 text-sm">{newsAdjusted.reason}</p>
                      </div>
                    </div>
                  )}
                  {wc && result.whaleAdjustedReason && (
                    <div className="mt-3">
                      <h2 className="text-base font-bold text-white mb-2">結論（大口動向加味 <span className="text-xs font-normal text-gray-400">※試行中</span>）</h2>
                      <div className={`border rounded-lg p-3 ${wc.bg}`}>
                        <div className={`text-lg font-bold ${wc.color} mb-1`}>{wc.label}</div>
                        <p className="text-gray-300 text-sm">{result.whaleAdjustedReason}</p>
                      </div>
                    </div>
                  )}
                </>
              );
            })() : (
              <Placeholder text="分析を実行すると結論が表示されます" />
            )}
          </div>

          {/* PR Comparison card */}
          <div className="bg-gray-800 rounded-lg p-0 overflow-hidden flex-1">
            {result ? (
              <PRComparison
                longSetup={result.longSetup}
                shortSetup={result.shortSetup}
                symbol={currentSymbol}
                livePrice={livePrice}
                vertical
              />
            ) : (
              <div className="p-3">
                <h2 className="text-base font-bold text-white mb-2">PR比較 (Long vs Short)</h2>
                <Placeholder text="分析を実行するとPR比較が表示されます" />
              </div>
            )}
          </div>
        </div>

        {/* Right column — Chart + Simulator */}
        <div className="flex flex-col gap-3">
          <HyperliquidChart symbol={currentSymbol} levels={result?.levels} volumeProfile={result?.volumeProfile} />
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
              <div className="p-3">
                <h2 className="text-base font-bold text-white mb-2">売買シミュレーター</h2>
                <Placeholder text="分析を実行するとシミュレーターが使用可能になります" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Row 2: Bottom — ポジション管理 ===== */}
      <div className="grid grid-cols-1 gap-3">
        {/* Position Manager */}
        <div className="bg-gray-800 rounded-lg p-0 overflow-hidden max-h-[250px] overflow-y-auto">
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
            <div className="p-3">
              <h2 className="text-base font-bold text-white mb-2">ポジション管理</h2>
              <Placeholder text="登録されたポジションはありません" />
            </div>
          )}
        </div>

        {/* Analysis History (hidden) */}
      </div>

    </div>
  );
}
