'use client';

import { useState } from 'react';
import { AnalysisResult, Timeframe } from '@/lib/types';
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
// 将来用に残す
// import AISettings from '@/components/AISettings';
// import AIAnalysis from '@/components/AIAnalysis';
// import ImageUpload from '@/components/ImageUpload';
import CopyPrompt from '@/components/CopyPrompt';

// 将来用に残す
// const AI_SETTINGS_KEY = 'crypto-signal-ai-settings';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState('BTCUSDT');
  const { pendingPositions, openPositions, closedPositions, addPosition, fillPosition, removePosition, closePosition, resetAll, maxPositions, positions } = useSavedPositions();
  const [viewMode, setViewMode] = useState<'simple' | 'detail'>('simple');
  const livePrice = useLivePrice(result ? currentSymbol : null);

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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Cryptocurrency Outlook</h1>
        </div>

        {/* Input */}
        <SymbolInput onAnalyze={handleAnalyze} loading={loading} />

        {/* AI Settings - 将来用に非表示 */}
        {/* <AISettings
          settings={aiSettings}
          onSave={handleSaveAISettings}
          onClear={handleClearAISettings}
        /> */}

        {/* Image Upload - 将来用に非表示 */}
        {/* <ImageUpload onImageSelect={setImageBase64} imageBase64={imageBase64} /> */}

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

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* View mode toggle */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('simple')}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    viewMode === 'simple'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  簡易版
                </button>
                <button
                  onClick={() => setViewMode('detail')}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    viewMode === 'detail'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  詳細版
                </button>
              </div>
            </div>

            {/* Both modes: PR Comparison */}
            <PRComparison longSetup={result.longSetup} shortSetup={result.shortSetup} symbol={currentSymbol} livePrice={livePrice} />

            {/* Both modes: Position Simulator */}
            <PositionSimulator
              longSetup={result.longSetup}
              shortSetup={result.shortSetup}
              symbol={currentSymbol}
              onSavePosition={addPosition}
              positionCount={positions.length}
              maxPositions={maxPositions}
            />

            {/* Both modes: Saved Positions */}
            <PositionManager
              pendingPositions={pendingPositions}
              openPositions={openPositions}
              closedPositions={closedPositions}
              onRemove={removePosition}
              onFill={fillPosition}
              onClose={closePosition}
              onResetAll={resetAll}
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
        <footer className="text-center text-base font-semibold text-red-600 pt-8 pb-4">
          <p>データソース: Binance Futures | 投資助言ではありません</p>
        </footer>
      </div>
    </main>
  );
}
