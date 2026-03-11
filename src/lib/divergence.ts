import { RSI, MACD } from 'technicalindicators';
import { OHLCV, Divergence } from './types';

interface SwingPoint {
  index: number;
  price: number;
  value: number; // indicator value at this point
}

function findPriceSwingLows(candles: OHLCV[], lookback = 5): { index: number; price: number }[] {
  const swings: { index: number; price: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].low > candles[i - j].low || candles[i].low > candles[i + j].low) {
        isLow = false;
        break;
      }
    }
    if (isLow) swings.push({ index: i, price: candles[i].low });
  }
  return swings;
}

function findPriceSwingHighs(candles: OHLCV[], lookback = 5): { index: number; price: number }[] {
  const swings: { index: number; price: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high < candles[i - j].high || candles[i].high < candles[i + j].high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) swings.push({ index: i, price: candles[i].high });
  }
  return swings;
}

function findIndicatorSwingLows(values: number[], lookback = 5): { index: number; value: number }[] {
  const swings: { index: number; value: number }[] = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (values[i] > values[i - j] || values[i] > values[i + j]) {
        isLow = false;
        break;
      }
    }
    if (isLow) swings.push({ index: i, value: values[i] });
  }
  return swings;
}

function findIndicatorSwingHighs(values: number[], lookback = 5): { index: number; value: number }[] {
  const swings: { index: number; value: number }[] = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    let isHigh = true;
    for (let j = 1; j <= lookback; j++) {
      if (values[i] < values[i - j] || values[i] < values[i + j]) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) swings.push({ index: i, value: values[i] });
  }
  return swings;
}

function matchSwingPoints(
  priceSwings: { index: number; price: number }[],
  indicatorSwings: { index: number; value: number }[],
  tolerance = 3 // index tolerance for matching
): SwingPoint[] {
  const matched: SwingPoint[] = [];
  for (const ps of priceSwings) {
    const closest = indicatorSwings.reduce<{ index: number; value: number } | null>((best, is) => {
      if (Math.abs(is.index - ps.index) <= tolerance) {
        if (!best || Math.abs(is.index - ps.index) < Math.abs(best.index - ps.index)) {
          return is;
        }
      }
      return best;
    }, null);
    if (closest) {
      matched.push({ index: ps.index, price: ps.price, value: closest.value });
    }
  }
  return matched;
}

export function detectDivergences(candles: OHLCV[]): Divergence[] {
  if (candles.length < 30) return [];

  const divergences: Divergence[] = [];
  const closes = candles.map((c) => c.close);

  // Calculate RSI series
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  // Offset: RSI has (period) fewer values than closes
  const rsiOffset = closes.length - rsiValues.length;

  // Calculate MACD histogram series
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdOffset = closes.length - macdValues.length;
  const macdHist = macdValues.map((m) => m.histogram ?? 0);

  // --- RSI Divergence ---
  if (rsiValues.length >= 20) {
    const priceLows = findPriceSwingLows(candles);
    const priceHighs = findPriceSwingHighs(candles);
    const rsiLows = findIndicatorSwingLows(rsiValues);
    const rsiHighs = findIndicatorSwingHighs(rsiValues);

    // Adjust price swing indices to RSI index space
    const adjPriceLows = priceLows
      .filter((p) => p.index >= rsiOffset)
      .map((p) => ({ index: p.index - rsiOffset, price: p.price }));
    const adjPriceHighs = priceHighs
      .filter((p) => p.index >= rsiOffset)
      .map((p) => ({ index: p.index - rsiOffset, price: p.price }));

    // Match swing lows
    const matchedLows = matchSwingPoints(adjPriceLows, rsiLows);
    if (matchedLows.length >= 2) {
      const prev = matchedLows[matchedLows.length - 2];
      const curr = matchedLows[matchedLows.length - 1];

      // Bullish divergence: lower lows in price, higher lows in RSI
      if (curr.price < prev.price && curr.value > prev.value) {
        divergences.push({
          type: 'bullish',
          indicator: 'rsi',
          description: `RSI強気ダイバージェンス: 価格は安値更新だがRSIは切り上げ → 下落の勢い減衰`,
        });
      }
      // Hidden bullish: higher lows in price, lower lows in RSI
      if (curr.price > prev.price && curr.value < prev.value) {
        divergences.push({
          type: 'hidden_bullish',
          indicator: 'rsi',
          description: `RSIヒドゥン強気ダイバージェンス: 上昇トレンド継続サイン`,
        });
      }
    }

    // Match swing highs
    const matchedHighs = matchSwingPoints(adjPriceHighs, rsiHighs);
    if (matchedHighs.length >= 2) {
      const prev = matchedHighs[matchedHighs.length - 2];
      const curr = matchedHighs[matchedHighs.length - 1];

      // Bearish divergence: higher highs in price, lower highs in RSI
      if (curr.price > prev.price && curr.value < prev.value) {
        divergences.push({
          type: 'bearish',
          indicator: 'rsi',
          description: `RSI弱気ダイバージェンス: 価格は高値更新だがRSIは切り下げ → 上昇の勢い減衰`,
        });
      }
      // Hidden bearish: lower highs in price, higher highs in RSI
      if (curr.price < prev.price && curr.value > prev.value) {
        divergences.push({
          type: 'hidden_bearish',
          indicator: 'rsi',
          description: `RSIヒドゥン弱気ダイバージェンス: 下落トレンド継続サイン`,
        });
      }
    }
  }

  // --- MACD Divergence ---
  if (macdHist.length >= 20) {
    const priceLows = findPriceSwingLows(candles);
    const priceHighs = findPriceSwingHighs(candles);
    const macdLows = findIndicatorSwingLows(macdHist);
    const macdHighs = findIndicatorSwingHighs(macdHist);

    const adjPriceLows = priceLows
      .filter((p) => p.index >= macdOffset)
      .map((p) => ({ index: p.index - macdOffset, price: p.price }));
    const adjPriceHighs = priceHighs
      .filter((p) => p.index >= macdOffset)
      .map((p) => ({ index: p.index - macdOffset, price: p.price }));

    const matchedLows = matchSwingPoints(adjPriceLows, macdLows);
    if (matchedLows.length >= 2) {
      const prev = matchedLows[matchedLows.length - 2];
      const curr = matchedLows[matchedLows.length - 1];

      if (curr.price < prev.price && curr.value > prev.value) {
        divergences.push({
          type: 'bullish',
          indicator: 'macd',
          description: `MACDヒストグラム強気ダイバージェンス: 下落モメンタム減少`,
        });
      }
    }

    const matchedHighs = matchSwingPoints(adjPriceHighs, macdHighs);
    if (matchedHighs.length >= 2) {
      const prev = matchedHighs[matchedHighs.length - 2];
      const curr = matchedHighs[matchedHighs.length - 1];

      if (curr.price > prev.price && curr.value < prev.value) {
        divergences.push({
          type: 'bearish',
          indicator: 'macd',
          description: `MACDヒストグラム弱気ダイバージェンス: 上昇モメンタム減少`,
        });
      }
    }
  }

  return divergences;
}
