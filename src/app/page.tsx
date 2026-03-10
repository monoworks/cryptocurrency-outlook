'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnalysisResult, Timeframe, AISettings as AISettingsType } from '@/lib/types';
import { buildAnalysisPrompt } from '@/lib/prompt-builder';
import SymbolInput from '@/components/SymbolInput';
import MarketSummary from '@/components/MarketSummary';
import TrendBadge from '@/components/TrendBadge';
import SRLevels from '@/components/SRLevels';
import PRComparison from '@/components/PRComparison';
import BreakoutLevels from '@/components/BreakoutLevels';
import Conclusion from '@/components/Conclusion';
import AISettings from '@/components/AISettings';
import AIAnalysis from '@/components/AIAnalysis';
import CopyPrompt from '@/components/CopyPrompt';
import ImageUpload from '@/components/ImageUpload';

const AI_SETTINGS_KEY = 'crypto-signal-ai-settings';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettingsType | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AI_SETTINGS_KEY);
      if (stored) setAiSettings(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const handleSaveAISettings = useCallback((settings: AISettingsType) => {
    setAiSettings(settings);
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  }, []);

  const handleClearAISettings = useCallback(() => {
    setAiSettings(null);
    localStorage.removeItem(AI_SETTINGS_KEY);
  }, []);

  const handleAnalyze = async (symbol: string, timeframes: Timeframe[]) => {
    setLoading(true);
    setError(null);
    setResult(null);

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
          <h1 className="text-2xl font-bold">Crypto Trading Signal Calculator</h1>
          <p className="text-gray-400 text-sm mt-1">暗号通貨トレーディングシグナル計算機</p>
        </div>

        {/* Input */}
        <SymbolInput onAnalyze={handleAnalyze} loading={loading} />

        {/* AI Settings */}
        <AISettings
          settings={aiSettings}
          onSave={handleSaveAISettings}
          onClear={handleClearAISettings}
        />

        {/* Image Upload */}
        <ImageUpload onImageSelect={setImageBase64} imageBase64={imageBase64} />

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
            <MarketSummary data={result.marketSummary} />
            <TrendBadge trend={result.trend} timeframeDetails={result.timeframeDetails} />
            <SRLevels levels={result.levels} currentPrice={result.marketSummary.currentPrice} />
            <PRComparison longSetup={result.longSetup} shortSetup={result.shortSetup} />
            <BreakoutLevels levels={result.breakoutLevels} />
            <Conclusion
              conclusion={result.conclusion}
              reason={result.conclusionReason}
              patterns={result.patterns}
              derivatives={result.derivatives}
              indicators={result.indicators}
            />

            {/* AI Analysis */}
            <AIAnalysis
              settings={aiSettings}
              analysisResult={result}
              imageBase64={imageBase64}
            />

            {/* Copy Prompt */}
            <CopyPrompt prompt={buildAnalysisPrompt(result)} />
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-600 pt-8 pb-4">
          <p>データソース: Binance Futures | 投資助言ではありません</p>
        </footer>
      </div>
    </main>
  );
}
