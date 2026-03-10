'use client';

import { useState } from 'react';

interface Props {
  prompt: string;
}

export default function CopyPrompt({ prompt }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">コピペ用プロンプト</h2>
        <button
          onClick={handleCopy}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            copied ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {copied ? 'コピーしました!' : 'コピー'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-2">
        下記をChatGPTなどに貼り付けて、AI分析を依頼できます。
      </p>
      <pre className="bg-gray-900 rounded p-3 text-xs text-gray-300 overflow-auto max-h-60 whitespace-pre-wrap">
        {prompt}
      </pre>
    </div>
  );
}
