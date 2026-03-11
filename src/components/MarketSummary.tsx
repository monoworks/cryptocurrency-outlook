'use client';

import { AnalysisResult } from '@/lib/types';
import HelpTip from './HelpTip';

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
        <Item label="現在価格" help="今のこの通貨の取引価格です" value={`$${fmt(data.currentPrice)}`} />
        <Item label="前日比" help="24時間前と比べた価格の変化率です。プラスなら値上がり、マイナスなら値下がり" value={`${changeSign}${data.priceChangePercent.toFixed(2)}%`} valueClass={changeColor} />
        <Item label="24h出来高" help="過去24時間に取引された金額の合計です。大きいほど活発に取引されています" value={`$${fmt(data.volume24h, 0)}`} />
        <Item label="建玉 (OI)" help="未決済のポジション量です。増加は新規参入、減少はポジション解消を示します" value={fmt(data.openInterest, 0)} />
        <Item label="Funding Rate" help="ロング（買い）とショート（売り）のバランス調整手数料です。プラスならロングが多く、マイナスならショートが多い傾向" value={`${(data.fundingRate * 100).toFixed(4)}%`}
          valueClass={data.fundingRate > 0.0005 ? 'text-yellow-400' : data.fundingRate < -0.0005 ? 'text-blue-400' : 'text-gray-200'} />
        <Item label="Premium" help="先物価格と現物価格の差です。プラスなら先物が割高、マイナスなら割安" value={`${data.premium.toFixed(4)}%`}
          valueClass={data.premium > 0 ? 'text-green-400' : data.premium < 0 ? 'text-red-400' : 'text-gray-200'} />
        <Item label="直近高値" help="分析期間内の最も高い価格です" value={`$${fmt(data.recentHigh)}`} />
        <Item label="直近安値" help="分析期間内の最も低い価格です" value={`$${fmt(data.recentLow)}`} />
        {data.prevDayHigh != null && (
          <Item label="前日高値" help="前日（日足）の最高値。現在値がここを上回れば強気" value={`$${fmt(data.prevDayHigh)}`}
            valueClass={data.currentPrice > data.prevDayHigh ? 'text-green-400' : 'text-gray-200'} />
        )}
        {data.prevDayLow != null && (
          <Item label="前日安値" help="前日（日足）の最安値。現在値がここを下回れば弱気" value={`$${fmt(data.prevDayLow)}`}
            valueClass={data.currentPrice < data.prevDayLow ? 'text-red-400' : 'text-gray-200'} />
        )}
      </div>
    </div>
  );
}

function Item({ label, help, value, valueClass = 'text-gray-200' }: { label: string; help?: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}{help && <HelpTip text={help} />}</div>
      <div className={`text-sm font-mono font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}
