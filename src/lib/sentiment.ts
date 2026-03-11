export interface FearGreedData {
  value: number;           // 0-100
  label: string;           // Extreme Fear, Fear, Neutral, Greed, Extreme Greed
  timestamp: number;
  previousValue?: number;  // yesterday's value
  change?: number;         // change from yesterday
}

export interface SentimentAnalysis {
  fearGreed?: FearGreedData;
  description: string;
  signal: 'contrarian_bullish' | 'contrarian_bearish' | 'confirming' | 'neutral';
}

/**
 * Fetch Fear & Greed Index from Alternative.me (free, no API key required)
 */
export async function fetchFearGreedIndex(): Promise<FearGreedData | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=2&format=json', {
      next: { revalidate: 300 }, // cache 5 minutes
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      data: { value: string; value_classification: string; timestamp: string }[];
    };

    if (!data.data || data.data.length === 0) return null;

    const latest = data.data[0];
    const value = parseInt(latest.value, 10);
    const label = translateClassification(latest.value_classification);

    let previousValue: number | undefined;
    let change: number | undefined;
    if (data.data.length > 1) {
      previousValue = parseInt(data.data[1].value, 10);
      change = value - previousValue;
    }

    return {
      value,
      label,
      timestamp: parseInt(latest.timestamp, 10) * 1000,
      previousValue,
      change,
    };
  } catch {
    return null;
  }
}

function translateClassification(classification: string): string {
  switch (classification.toLowerCase()) {
    case 'extreme fear': return '極度の恐怖';
    case 'fear': return '恐怖';
    case 'neutral': return '中立';
    case 'greed': return '貪欲';
    case 'extreme greed': return '極度の貪欲';
    default: return classification;
  }
}

/**
 * Analyze sentiment from Fear & Greed Index.
 * Contrarian logic: extreme fear = buying opportunity, extreme greed = caution.
 */
export function analyzeSentiment(fearGreed: FearGreedData | null): SentimentAnalysis {
  if (!fearGreed) {
    return { description: 'センチメントデータ取得不可', signal: 'neutral' };
  }

  const { value, label, change } = fearGreed;
  let signal: SentimentAnalysis['signal'];
  let description: string;

  if (value <= 20) {
    signal = 'contrarian_bullish';
    description = `Fear & Greed: ${value} (${label}) — 極度の恐怖は逆張り買いのチャンス`;
  } else if (value <= 35) {
    signal = 'contrarian_bullish';
    description = `Fear & Greed: ${value} (${label}) — 恐怖局面、押し目買い検討`;
  } else if (value >= 80) {
    signal = 'contrarian_bearish';
    description = `Fear & Greed: ${value} (${label}) — 極度の貪欲は調整リスク大`;
  } else if (value >= 65) {
    signal = 'contrarian_bearish';
    description = `Fear & Greed: ${value} (${label}) — 貪欲局面、利確を検討`;
  } else {
    signal = 'neutral';
    description = `Fear & Greed: ${value} (${label}) — 中立`;
  }

  if (change != null) {
    const changeStr = change > 0 ? `+${change}` : `${change}`;
    description += ` (前日比: ${changeStr})`;
  }

  return { fearGreed, description, signal };
}
