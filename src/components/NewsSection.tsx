'use client';

import { useState } from 'react';
import { NewsArticle } from '@/lib/types';

interface NewsSectionProps {
  articles: NewsArticle[] | null;
}

export default function NewsSection({ articles }: NewsSectionProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (!articles || articles.length === 0) return null;

  return (
    <div className="border border-gray-600 bg-gray-800 rounded-lg p-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="font-semibold text-sm text-gray-300">
          世界情勢ニュース
          <span className="text-xs text-gray-500 ml-2">({articles.length}件)</span>
        </div>
        <span className="text-gray-500 text-xs">{collapsed ? '▼ 展開' : '▲ 折りたたむ'}</span>
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-2">
          {articles.map((article, i) => (
            <div key={i} className="border-t border-gray-700 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 hover:underline leading-snug block"
                  >
                    {article.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                    <span>{article.pubDateJST}</span>
                    <span>|</span>
                    <span>{article.source}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
