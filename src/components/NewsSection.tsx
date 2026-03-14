'use client';

import { useState } from 'react';
import { NewsArticle } from '@/lib/types';

interface NewsSectionProps {
  articles: NewsArticle[] | null;
}

const tagStyle: Record<string, { label: string; color: string; bg: string }> = {
  crypto: { label: '規制', color: 'text-yellow-400', bg: 'bg-yellow-900/40' },
  geopolitical: { label: '地政学', color: 'text-orange-400', bg: 'bg-orange-900/40' },
};

const impactStyle: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '高', color: 'text-red-400', bg: 'bg-red-900/40' },
  medium: { label: '中', color: 'text-amber-400', bg: 'bg-amber-900/40' },
  low: { label: '低', color: 'text-gray-400', bg: 'bg-gray-700/40' },
};

export default function NewsSection({ articles }: NewsSectionProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (!articles || articles.length === 0) return null;

  const geoCount = articles.filter((a) => a.tag === 'geopolitical').length;
  const highCount = articles.filter((a) => a.impact === 'high').length;

  return (
    <div className="border border-gray-600 bg-gray-800 rounded-lg p-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="font-semibold text-sm text-gray-300 flex items-center gap-2">
          リスクニュース
          <span className="text-xs text-gray-500">({articles.length}件)</span>
          {geoCount > 0 && (
            <span className="text-[10px] font-bold text-orange-400 bg-orange-900/40 px-1.5 py-0.5 rounded">
              地政学 {geoCount}件
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[10px] font-bold text-red-400 bg-red-900/40 px-1.5 py-0.5 rounded">
              高影響 {highCount}件
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{collapsed ? '▼ 展開' : '▲ 折りたたむ'}</span>
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-2">
          {articles.map((article, i) => {
            const style = tagStyle[article.tag] ?? tagStyle.crypto;
            const impact = impactStyle[article.impact ?? 'low'] ?? impactStyle.low;
            return (
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
                      <span className={`font-bold px-1 py-0.5 rounded ${style.color} ${style.bg}`}>
                        {style.label}
                      </span>
                      <span className={`font-bold px-1 py-0.5 rounded ${impact.color} ${impact.bg}`}>
                        影響{impact.label}
                      </span>
                      {article.relevanceScore != null && (
                        <span className="text-gray-600">
                          関連度{article.relevanceScore}/10
                        </span>
                      )}
                      <span>{article.pubDateJST}</span>
                      <span>|</span>
                      <span>{article.source}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
