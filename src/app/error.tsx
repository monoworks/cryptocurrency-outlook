'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-bold text-red-400">クライアントエラーが発生しました</h2>
        <div className="bg-gray-900 rounded p-4 overflow-auto">
          <p className="text-sm text-red-300 font-mono break-all">{error.message}</p>
          {error.stack && (
            <pre className="text-xs text-gray-400 mt-2 whitespace-pre-wrap break-all">
              {error.stack}
            </pre>
          )}
          {error.digest && (
            <p className="text-xs text-gray-500 mt-2">Digest: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
        >
          再試行
        </button>
      </div>
    </div>
  );
}
