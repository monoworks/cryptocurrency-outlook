'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnalysisResult, EconomicCalendarAnalysis, NewsArticle, Timeframe } from '@/lib/types';
import { buildAnalysisPrompt } from '@/lib/prompt-builder';
import { useSavedPositions } from '@/hooks/useSavedPositions';
import { useLivePrice } from '@/hooks/useLivePrice';
import SymbolInput from '@/components/SymbolInput';
import MarketSummary from '@/components/MarketSummary';
import TrendBadge from '@/components/TrendBadge';
import SRLevels from '@/components/SRLevels';
import PRComparison from '@/components/PRComparison';
import PositionSimulator from '@/components/PositionSimulator';
import PositionManager from '@/components/PositionManager';
import BreakoutLevels from '@/components/BreakoutLevels';
import Conclusion from '@/components/Conclusion';
import AnalysisHistory, { HistoryEntry } from '@/components/AnalysisHistory';
// 将来用に残す
// import AISettings from '@/components/AISettings';
// import AIAnalysis from '@/components/AIAnalysis';
// import ImageUpload from '@/components/ImageUpload';
import CopyPrompt from '@/components/CopyPrompt';
import NewsSection from '@/components/NewsSection';
import DashboardView from '@/components/DashboardView';

const HISTORY_KEY = 'crypto-outlook-history';
const MAX_HISTORY = 100;

// 将来用に残す
// const AI_SETTINGS_KEY = 'crypto-signal-ai-settings';

type Theme = 'dark' | 'light' | 'soft' | 'blue' | 'sakura' | 'orange';

const THEME_KEY = 'crypto-outlook-theme';

const themeConfig: Record<Theme, { bg: string; text: string; label: string; swatch: string }> = {
  dark:   { bg: 'bg-gray-900',   text: 'text-white',    label: '黒',         swatch: 'bg-gray-900' },
  light:  { bg: 'bg-white',      text: 'text-gray-900', label: '白',         swatch: 'bg-white' },
  soft:   { bg: 'bg-amber-50',   text: 'text-gray-800', label: 'やさしい',   swatch: 'bg-amber-100' },
  blue:   { bg: 'bg-sky-50',     text: 'text-gray-800', label: '淡い青',     swatch: 'bg-sky-200' },
  sakura: { bg: 'bg-pink-50',    text: 'text-gray-800', label: '桜色',       swatch: 'bg-pink-200' },
  orange: { bg: 'bg-orange-50',  text: 'text-gray-800', label: '淡いオレンジ', swatch: 'bg-orange-200' },
};

export default function Home() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && saved in themeConfig) setTheme(saved as Theme);
  }, []);
  const handleSetTheme = useCallback((t: Theme) => {
    setTheme(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState('BTCUSDT');
  const { pendingPositions, openPositions, closedPositions, addPosition, fillPosition, removePosition, closePosition, resetAll, maxPositions, positions } = useSavedPositions();
  const [viewMode, setViewMode] = useState<'simple' | 'detail' | 'dashboard'>('simple');
  const livePrice = useLivePrice(result ? currentSymbol : null);
  const [standaloneCalendar, setStandaloneCalendar] = useState<EconomicCalendarAnalysis | null>(null);
  const [calendarCollapsed, setCalendarCollapsed] = useState(true);
  const [news, setNews] = useState<NewsArticle[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputCollapsed, setInputCollapsed] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveHistory = useCallback((entries: HistoryEntry[]) => {
    setHistory(entries);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  }, []);

  const addToHistory = useCallback((res: AnalysisResult, symbol: string) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      symbol: symbol.toUpperCase(),
      conclusion: res.conclusion,
      currentPrice: res.marketSummary.currentPrice,
      confidence: res.confidence?.score,
      result: res,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setResult(entry.result);
    setCurrentSymbol(entry.symbol);
  }, []);

  const deleteFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const importHistory = useCallback((entries: HistoryEntry[]) => {
    setHistory((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const newEntries = entries.filter((e) => !existingIds.has(e.id));
      const next = [...newEntries, ...prev].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    saveHistory([]);
  }, [saveHistory]);

  // Fetch economic calendar on page load (independent of analysis)
  useEffect(() => {
    fetch('/api/economic-calendar')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setStandaloneCalendar(data); })
      .catch(() => {});
  }, []);

  // Fetch news on page load
  useEffect(() => {
    fetch('/api/news')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.articles) setNews(data.articles); })
      .catch(() => {});
  }, []);

  // 将来用に残す（AI分析・画像アップロード）
  // const [aiSettings, setAiSettings] = useState<AISettingsType | null>(null);
  // const [imageBase64, setImageBase64] = useState<string | null>(null);
  // useEffect(() => {
  //   try {
  //     const stored = localStorage.getItem(AI_SETTINGS_KEY);
  //     if (stored) setAiSettings(JSON.parse(stored));
  //   } catch { /* ignore */ }
  // }, []);
  // const handleSaveAISettings = useCallback((settings: AISettingsType) => {
  //   setAiSettings(settings);
  //   localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  // }, []);
  // const handleClearAISettings = useCallback(() => {
  //   setAiSettings(null);
  //   localStorage.removeItem(AI_SETTINGS_KEY);
  // }, []);

  const handleAnalyze = async (symbol: string, timeframes: Timeframe[]) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentSymbol(symbol.toUpperCase());

    try {
      const tfParam = timeframes.join(',');
      const res = await fetch(`/api/analyze?symbol=${encodeURIComponent(symbol)}&timeframes=${encodeURIComponent(tfParam)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '分析に失敗しました');
      } else {
        setResult(data);
        addToHistory(data, symbol);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`min-h-screen ${themeConfig[theme].bg} ${themeConfig[theme].text} transition-colors duration-300`}>
      <div className={`${viewMode === 'dashboard' ? 'max-w-full px-6' : 'max-w-5xl px-4'} mx-auto py-4 space-y-3 transition-all duration-300`}>
        {/* Header */}
        <div className="relative text-center mb-6">
          <h1 className="text-2xl font-bold">Cryptocurrency Outlook</h1>
          <p className="text-base font-semibold text-red-600 mt-1">データソース: Binance Futures | 投資助言ではありません</p>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1.5">
            {(Object.keys(themeConfig) as Theme[]).map((key) => (
              <button
                key={key}
                onClick={() => handleSetTheme(key)}
                title={themeConfig[key].label}
                className={`w-7 h-7 rounded-full border-2 transition-all ${themeConfig[key].swatch} ${
                  theme === key
                    ? 'border-blue-500 scale-110 ring-2 ring-blue-400'
                    : 'border-gray-500 hover:border-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Input — collapsible in dashboard mode */}
        {viewMode === 'dashboard' ? (
          <div>
            <button
              onClick={() => setInputCollapsed(!inputCollapsed)}
              className="w-full flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2 hover:bg-gray-700 transition-colors"
            >
              <span className="text-sm text-gray-300 font-medium">
                銘柄設定・分析開始
                {inputCollapsed && <span className="text-gray-500 ml-2">— {currentSymbol}</span>}
              </span>
              <span className="text-gray-500 text-xs">{inputCollapsed ? '▼ 展開' : '▲ 折りたたむ'}</span>
            </button>
            {!inputCollapsed && (
              <div className="mt-2">
                <SymbolInput onAnalyze={handleAnalyze} loading={loading} />
              </div>
            )}
          </div>
        ) : (
          <SymbolInput onAnalyze={handleAnalyze} loading={loading} />
        )}

        {/* AI Settings - 将来用に非表示 */}
        {/* <AISettings
          settings={aiSettings}
          onSave={handleSaveAISettings}
          onClear={handleClearAISettings}
        /> */}

        {/* Image Upload - 将来用に非表示 */}
        {/* <ImageUpload onImageSelect={setImageBase64} imageBase64={imageBase64} /> */}

        {/* View mode toggle — always visible */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {([
              { key: 'simple' as const, label: '簡易版' },
              { key: 'detail' as const, label: '詳細版' },
              { key: 'dashboard' as const, label: 'ダッシュボード' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-600 border-t-blue-500" />
            <p className="text-gray-400 mt-3">Binance APIからデータ取得中...</p>
          </div>
        )}

        {/* Dashboard mode — always rendered (shows placeholders when no result) */}
        {viewMode === 'dashboard' && (
          <DashboardView
            result={result}
            currentSymbol={currentSymbol}
            livePrice={livePrice}
            standaloneCalendar={standaloneCalendar}
            news={news}
            pendingPositions={pendingPositions}
            openPositions={openPositions}
            closedPositions={closedPositions}
            addPosition={addPosition}
            fillPosition={fillPosition}
            removePosition={removePosition}
            closePosition={closePosition}
            resetAll={resetAll}
            positions={positions}
            maxPositions={maxPositions}
            history={history}
            loadFromHistory={loadFromHistory}
            deleteFromHistory={deleteFromHistory}
            importHistory={importHistory}
            clearHistory={clearHistory}
          />
        )}

        {/* Simple / Detail modes: pre-analysis content */}
        {viewMode !== 'dashboard' && !result && (
          <>
            {/* Standalone Economic Calendar */}
            {standaloneCalendar && (
              <div className={`border rounded-lg p-3 ${
                standaloneCalendar.warningLevel === 'danger'
                  ? 'border-red-500 bg-red-900/20'
                  : standaloneCalendar.warningLevel === 'caution'
                    ? 'border-yellow-500 bg-yellow-900/20'
                    : 'border-gray-600 bg-gray-800'
              }`}>
                <button
                  onClick={() => setCalendarCollapsed(!calendarCollapsed)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className={`font-semibold text-sm ${
                    standaloneCalendar.warningLevel === 'danger' ? 'text-red-400'
                      : standaloneCalendar.warningLevel === 'caution' ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}>
                    {standaloneCalendar.warningLevel === 'danger' ? '⚠ 重要経済指標 発表間近'
                      : '経済指標カレンダー'}
                  </div>
                  <span className="text-gray-500 text-xs">{calendarCollapsed ? '▼ 展開' : '▲ 折りたたむ'}</span>
                </button>
                {!calendarCollapsed && (
                  <>
                    <div className={`text-xs mt-1 ${
                      standaloneCalendar.warningLevel === 'danger' ? 'text-red-300'
                        : standaloneCalendar.warningLevel === 'caution' ? 'text-yellow-300'
                        : 'text-gray-500'
                    }`}>
                      {standaloneCalendar.description}
                    </div>
                    {standaloneCalendar.events.filter((e) => e.impact === 'high' || e.impact === 'medium').length > 0 && (
                      <div className="mt-2 space-y-1">
                        {standaloneCalendar.events.filter((e) => e.impact === 'high' || e.impact === 'medium').slice(0, 5).map((e, i) => (
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
                )}
              </div>
            )}

            {/* Standalone News */}
            <NewsSection articles={news} />

            {/* Analysis History (before analysis) */}
            {!loading && history.length > 0 && (
              <AnalysisHistory
                history={history}
                onLoad={loadFromHistory}
                onDelete={deleteFromHistory}
                onImport={importHistory}
                onClearAll={clearHistory}
              />
            )}
          </>
        )}

        {/* Simple / Detail modes: post-analysis results */}
        {viewMode !== 'dashboard' && result && (
          <div className="space-y-4">
            {/* Economic Calendar Alert */}
            {result.economicCalendar && (
              <div className={`border rounded-lg p-3 ${
                result.economicCalendar.warningLevel === 'danger'
                  ? 'border-red-500 bg-red-900/20'
                  : result.economicCalendar.warningLevel === 'caution'
                    ? 'border-yellow-500 bg-yellow-900/20'
                    : 'border-gray-600 bg-gray-800'
              }`}>
                <button
                  onClick={() => setCalendarCollapsed(!calendarCollapsed)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className={`font-semibold text-sm ${
                    result.economicCalendar.warningLevel === 'danger' ? 'text-red-400'
                      : result.economicCalendar.warningLevel === 'caution' ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}>
                    {result.economicCalendar.warningLevel === 'danger' ? '⚠ 重要経済指標 発表間近'
                      : result.economicCalendar.warningLevel === 'caution' ? '経済指標カレンダー'
                      : '経済指標カレンダー'}
                  </div>
                  <span className="text-gray-500 text-xs">{calendarCollapsed ? '▼ 展開' : '▲ 折りたたむ'}</span>
                </button>
                {!calendarCollapsed && (
                  <>
                    <div className={`text-xs mt-1 ${
                      result.economicCalendar.warningLevel === 'danger' ? 'text-red-300'
                        : result.economicCalendar.warningLevel === 'caution' ? 'text-yellow-300'
                        : 'text-gray-500'
                    }`}>
                      {result.economicCalendar.description}
                    </div>
                    {result.economicCalendar.events.filter((e) => e.impact === 'high').length > 0 && (
                      <div className="mt-2 space-y-1">
                        {result.economicCalendar.events.filter((e) => e.impact === 'high').slice(0, 3).map((e, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-800 text-red-200">高</span>
                            <span className="text-gray-400">{e.timeJST}</span>
                            <span className="text-gray-300">{e.event}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* News */}
            <NewsSection articles={news} />

            {/* Simple mode: Conclusion summary */}
            {viewMode === 'simple' && (() => {
              const cfg: Record<string, { label: string; color: string; bg: string }> = {
                enter_long: { label: 'ロングエントリー推奨', color: 'text-green-400', bg: 'bg-green-900/30 border-green-500' },
                enter_short: { label: 'ショートエントリー推奨', color: 'text-red-400', bg: 'bg-red-900/30 border-red-500' },
                wait: { label: '引きつけて待機', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-500' },
                skip: { label: '見送り推奨', color: 'text-gray-400', bg: 'bg-gray-700/30 border-gray-500' },
              };
              const c = cfg[result.conclusion] ?? cfg.skip;
              return (
                <div className="bg-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-bold text-white mb-3">結論</h2>
                  <div className={`border rounded-lg p-4 ${c.bg}`}>
                    <div className={`text-xl font-bold ${c.color} mb-2`}>{c.label}</div>
                    <p className="text-gray-300 text-sm">{result.conclusionReason}</p>
                  </div>
                </div>
              );
            })()}

            {/* PR Comparison */}
            <PRComparison longSetup={result.longSetup} shortSetup={result.shortSetup} symbol={currentSymbol} livePrice={livePrice} />

            {/* Position Simulator */}
            <PositionSimulator
              longSetup={result.longSetup}
              shortSetup={result.shortSetup}
              symbol={currentSymbol}
              onSavePosition={addPosition}
              positionCount={positions.length}
              maxPositions={maxPositions}
            />

            {/* Saved Positions */}
            <PositionManager
              pendingPositions={pendingPositions}
              openPositions={openPositions}
              closedPositions={closedPositions}
              onRemove={removePosition}
              onFill={fillPosition}
              onClose={closePosition}
              onResetAll={resetAll}
            />

            {/* Analysis History */}
            <AnalysisHistory
              history={history}
              onLoad={loadFromHistory}
              onDelete={deleteFromHistory}
              onImport={importHistory}
              onClearAll={clearHistory}
            />

            {/* Detail mode only */}
            {viewMode === 'detail' && (
              <>
                <MarketSummary data={result.marketSummary} />
                <TrendBadge trend={result.trend} timeframeDetails={result.timeframeDetails} />
                <SRLevels levels={result.levels} currentPrice={result.marketSummary.currentPrice} />
                <BreakoutLevels levels={result.breakoutLevels} />
                <Conclusion
                  conclusion={result.conclusion}
                  reason={result.conclusionReason}
                  patterns={result.patterns}
                  derivatives={result.derivatives}
                  indicators={result.indicators}
                  hierarchical={result.hierarchical}
                  falseBreakouts={result.timeframeDetails.flatMap((d) => d.falseBreakouts ?? [])}
                  wickRejections={result.timeframeDetails.flatMap((d) => d.wickRejections ?? [])}
                  volumeSpikes={result.timeframeDetails.flatMap((d) => d.volumeSpikes ?? [])}
                  confidence={result.confidence}
                  divergences={result.timeframeDetails.flatMap((d) => d.divergences ?? [])}
                  topTraderRatio={result.topTraderRatio}
                  marketRegime={result.marketRegime}
                  volumeProfile={result.volumeProfile}
                  timeframeVolumeProfiles={result.timeframeVolumeProfiles}
                  liquidation={result.liquidation}
                  orderFlow={result.orderFlow}
                  divergenceAggregation={result.divergenceAggregation}
                  sentiment={result.sentiment}
                  economicCalendar={result.economicCalendar}
                />

                {/* AI Analysis - 将来用に非表示 */}
                {/* <AIAnalysis
                  settings={aiSettings}
                  analysisResult={result}
                  imageBase64={imageBase64}
                /> */}

                {/* Copy Prompt */}
                <CopyPrompt prompt={buildAnalysisPrompt(result)} />
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center pt-8 pb-4">
        </footer>
      </div>
    </main>
  );
}
