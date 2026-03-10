'use client';

import { useState, useEffect } from 'react';
import { AIProvider, AISettings as AISettingsType } from '@/lib/types';

const PROVIDERS: { value: AIProvider; label: string; models: { value: string; label: string }[] }[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    models: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
];

interface Props {
  settings: AISettingsType | null;
  onSave: (settings: AISettingsType) => void;
  onClear: () => void;
}

export default function AISettings({ settings, onSave, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AIProvider>(settings?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(settings?.apiKey ?? '');
  const [model, setModel] = useState(settings?.model ?? 'gpt-4o');

  const providerConfig = PROVIDERS.find((p) => p.value === provider)!;

  useEffect(() => {
    setModel(providerConfig.models[0].value);
  }, [provider, providerConfig.models]);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    onSave({ provider, apiKey: apiKey.trim(), model });
    setOpen(false);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">AI分析設定</h2>
        <div className="flex items-center gap-2">
          {settings ? (
            <>
              <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
                {PROVIDERS.find((p) => p.value === settings.provider)?.label} 設定済
              </span>
              <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">削除</button>
            </>
          ) : (
            <span className="text-xs text-gray-500">未設定</span>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {open ? '閉じる' : '設定'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-400">
            APIキーはブラウザのlocalStorageにのみ保存されます。サーバーには保存しません。
          </p>
          <div>
            <label className="block text-sm text-gray-400 mb-1">プロバイダー</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">APIキー</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">モデル</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
            >
              {providerConfig.models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm"
          >
            保存
          </button>
        </div>
      )}
    </div>
  );
}
