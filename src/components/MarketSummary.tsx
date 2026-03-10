'use client';

import { AnalysisResult } from '@/lib/types';

const TF_LABELS: Record<string, string> = {
  '5m': '5分足', '15m': '15分足', '1h': '1時間足', '4h': '4時間足', '1d': '日足',
};

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function MarketSummary({ data }: { data: AnalysisResult['marketSummary'] }) {
  const changeColor = data.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400';
  const changeSign = data.priceChangePercent >= 0 ? '+' : '';
  const tfDisplay = data.timeframes.map((tf) => TF_LABELS[tf] || tf).join(', ');

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">① マーケットデータ要約</h2>
      <div className="text-xs text-gray-400 mb-2">分析時間足: <span className="text-blue-400">{tfDisplay}</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Item label="現在価格" value={`$${fmt(data.currentPrice)}`} />
        <Item label="前日比" value={`${changeSign}${data.priceChangePercent.toFixed(2)}%`} valueClass={changeColor} />
        <Item label="24h出来高" value={`$${fmt(data.volume24h, 0)}`} />
        <Item label="建玉 (OI)" value={fmt(data.openInterest, 0)} />
        <Item label="Funding Rate" value={`${(data.fundingRate * 100).toFixed(4)}%`}
          valueClass={data.fundingRate > 0.0005 ? 'text-yellow-400' : data.fundingRate < -0.0005 ? 'text-blue-400' : 'text-gray-200'} />
        <Item label="Premium" value={`${data.premium.toFixed(4)}%`}
          valueClass={data.premium > 0 ? 'text-green-400' : data.premium < 0 ? 'text-red-400' : 'text-gray-200'} />
        <Item label="直近高値" value={`$${fmt(data.recentHigh)}`} />
        <Item label="直近安値" value={`$${fmt(data.recentLow)}`} />
      </div>
    </div>
  );
}

function Item({ label, value, valueClass = 'text-gray-200' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm font-mono font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}
