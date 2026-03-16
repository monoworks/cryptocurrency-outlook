import { WhaleActivity, WhaleTrade, WhaleWall } from './types';

/**
 * Detect whale activity from Binance aggTrades and order book depth data.
 *
 * Large trade threshold: trades whose USD value exceeds `thresholdMultiple` times
 * the median trade size are flagged as whale trades.
 *
 * Wall detection: order book levels whose USD value exceeds `wallThresholdUsd`
 * are flagged as whale walls.
 */

interface AggTrade {
  price: number;
  qty: number;
  quoteQty: number;
  time: number;
  isBuyerMaker: boolean;
}

interface OrderBookDepth {
  bids: [number, number][];  // [price, qty]
  asks: [number, number][];
}

const DEFAULT_TRADE_THRESHOLD_MULTIPLE = 10;  // 10x median
const DEFAULT_MIN_TRADE_USD = 50_000;         // at least $50k to count

export function analyzeWhaleActivity(
  trades: AggTrade[],
  depth: OrderBookDepth,
  currentPrice: number,
  options?: {
    tradeThresholdMultiple?: number;
    minTradeUsd?: number;
    wallThresholdUsd?: number;
  },
): WhaleActivity {
  const thresholdMultiple = options?.tradeThresholdMultiple ?? DEFAULT_TRADE_THRESHOLD_MULTIPLE;
  const minTradeUsd = options?.minTradeUsd ?? DEFAULT_MIN_TRADE_USD;

  // --- Large trade detection ---
  const quoteQtys = trades.map((t) => t.quoteQty).sort((a, b) => a - b);
  const median = quoteQtys.length > 0
    ? quoteQtys[Math.floor(quoteQtys.length / 2)]
    : 0;
  const tradeThreshold = Math.max(median * thresholdMultiple, minTradeUsd);

  const largeTrades: WhaleTrade[] = [];
  let buyVolume = 0;
  let sellVolume = 0;

  for (const t of trades) {
    if (t.quoteQty >= tradeThreshold) {
      // isBuyerMaker=true means the taker was selling (maker = buyer side of book)
      const side = t.isBuyerMaker ? 'sell' as const : 'buy' as const;
      largeTrades.push({
        time: t.time,
        price: t.price,
        quoteQty: t.quoteQty,
        side,
      });
      if (side === 'buy') buyVolume += t.quoteQty;
      else sellVolume += t.quoteQty;
    }
  }

  const netFlow = buyVolume - sellVolume;

  // --- Wall detection ---
  // Dynamic threshold: use 0.5% of 24h quote volume approximated from trades,
  // or at least $200k
  const totalTradeVolume = trades.reduce((sum, t) => sum + t.quoteQty, 0);
  const wallThresholdUsd = options?.wallThresholdUsd
    ?? Math.max(totalTradeVolume * 0.01, 200_000);

  const walls: WhaleWall[] = [];
  let bidWallVolume = 0;
  let askWallVolume = 0;

  for (const [price, qty] of depth.bids) {
    const usd = price * qty;
    if (usd >= wallThresholdUsd) {
      walls.push({ price, quoteQty: usd, side: 'bid' });
      bidWallVolume += usd;
    }
  }
  for (const [price, qty] of depth.asks) {
    const usd = price * qty;
    if (usd >= wallThresholdUsd) {
      walls.push({ price, quoteQty: usd, side: 'ask' });
      askWallVolume += usd;
    }
  }

  // Sort walls by distance from current price
  walls.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));

  // --- Signal determination ---
  const totalLargeVolume = buyVolume + sellVolume;
  let signal: WhaleActivity['signal'] = 'neutral';

  if (totalLargeVolume > 0) {
    const buyRatio = buyVolume / totalLargeVolume;
    if (buyRatio >= 0.65) signal = 'accumulation';
    else if (buyRatio <= 0.35) signal = 'distribution';
  }

  // Wall imbalance can reinforce or override trade-based signal
  const totalWallVolume = bidWallVolume + askWallVolume;
  if (totalWallVolume > 0 && signal === 'neutral') {
    const bidRatio = bidWallVolume / totalWallVolume;
    if (bidRatio >= 0.7) signal = 'accumulation';
    else if (bidRatio <= 0.3) signal = 'distribution';
  }

  // --- Description ---
  const parts: string[] = [];

  if (largeTrades.length > 0) {
    const buyCount = largeTrades.filter((t) => t.side === 'buy').length;
    const sellCount = largeTrades.filter((t) => t.side === 'sell').length;
    parts.push(`大口約定${largeTrades.length}件検出 (買${buyCount}/売${sellCount}, 買$${fmt(buyVolume)}/売$${fmt(sellVolume)})`);
  } else {
    parts.push('大口約定なし');
  }

  if (walls.length > 0) {
    const bidWalls = walls.filter((w) => w.side === 'bid');
    const askWalls = walls.filter((w) => w.side === 'ask');
    if (bidWalls.length > 0) {
      parts.push(`買い壁${bidWalls.length}件 ($${fmt(bidWallVolume)})`);
    }
    if (askWalls.length > 0) {
      parts.push(`売り壁${askWalls.length}件 ($${fmt(askWallVolume)})`);
    }
  }

  const signalLabel = signal === 'accumulation' ? '蓄積傾向（強気）'
    : signal === 'distribution' ? '分配傾向（弱気）'
    : '中立';
  parts.push(`判定: ${signalLabel}`);

  return {
    largeTrades: largeTrades.slice(0, 20),  // keep top 20 for display
    largeTradeCount: largeTrades.length,
    buyVolume,
    sellVolume,
    netFlow,
    walls: walls.slice(0, 10),  // keep top 10 closest walls
    bidWallVolume,
    askWallVolume,
    signal,
    description: parts.join('。'),
  };
}

function fmt(usd: number): string {
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `${(usd / 1_000).toFixed(0)}K`;
  return usd.toFixed(0);
}
