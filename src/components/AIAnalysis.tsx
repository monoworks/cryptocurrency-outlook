'use client';

import { useState } from 'react';
import { AISettings as AISettingsType, AnalysisResult } from '@/lib/types';
import { buildAnalysisPrompt, buildImageAnalysisPrompt } from '@/lib/prompt-builder';

interface Props {
  settings: AISettingsType | null;
  analysisResult: AnalysisResult;
  imageBase64: string | null;
}

export default function AIAnalysis({ settings, analysisResult, imageBase64 }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'data' | 'image' | 'both'>('data');

  if (!settings) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-2">AI分析</h2>
        <p className="text-gray-400 text-sm">
          AI分析を利用するには、上部の「AI分析設定」でAPIキーを設定してください。
        </p>
      </div>
    );
  }

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let prompt = '';
      let sendImage: string | undefined;

      if (mode === 'data' || mode === 'both') {
        prompt += buildAnalysisPrompt(analysisResult);
      }
      if ((mode === 'image' || mode === 'both') && imageBase64) {
        prompt += '\n\n' + buildImageAnalysisPrompt();
        sendImage = imageBase64;
      }
      if (mode === 'image' && !imageBase64) {
        setError('チャート画像がアップロードされていません。');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          prompt,
          imageBase64: sendImage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'AI分析に失敗しました');
      } else {
        setResult(data.result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">AI分析</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setMode('data')}
          className={`px-3 py-1 rounded text-sm ${mode === 'data' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          データ分析
        </button>
        <button
          onClick={() => setMode('image')}
          disabled={!imageBase64}
          className={`px-3 py-1 rounded text-sm ${mode === 'image' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'} disabled:opacity-50`}
        >
          画像分析
        </button>
        <button
          onClick={() => setMode('both')}
          disabled={!imageBase64}
          className={`px-3 py-1 rounded text-sm ${mode === 'both' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'} disabled:opacity-50`}
        >
          両方
        </button>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="ml-auto bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-1 rounded text-sm"
        >
          {loading ? 'AI分析中...' : 'AI分析開始'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500 rounded p-3 text-red-300 text-sm mb-3">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-gray-900 rounded p-4 text-sm text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
          {result}
        </div>
      )}
    </div>
  );
}
