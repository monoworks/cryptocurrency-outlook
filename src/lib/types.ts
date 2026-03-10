// ===== Market Data Types =====

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';

export interface TickerData {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
}

export interface OpenInterestData {
  symbol: string;
  openInterest: number;
  time: number;
}

export interface FundingRateData {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
}

export interface PremiumIndexData {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  interestRate: number;
}

export interface MarketData {
  symbol: string;
  timeframe: Timeframe;
  ticker: TickerData;
  candles: OHLCV[];
  openInterest: OpenInterestData;
  fundingRate: FundingRateData;
  premiumIndex: PremiumIndexData;
}

// ===== Technical Indicators =====

export interface IndicatorValues {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  vwap: number | null;
  bollingerBands: { upper: number; middle: number; lower: number } | null;
  adx: number | null;
}

// ===== Candlestick Patterns =====

export type PatternType =
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'hammer'
  | 'inverted_hammer'
  | 'doji'
  | 'long_upper_shadow'
  | 'long_lower_shadow'
  | 'consecutive_bullish'
  | 'consecutive_bearish';

export interface CandlePattern {
  type: PatternType;
  label: string;
  signal: 'bullish' | 'bearish' | 'neutral';
}

// ===== Trend =====

export type TrendDirection = 'uptrend' | 'downtrend' | 'range';
export type TrendStrength = 'strong' | 'moderate' | 'weak';

export interface TrendAnalysis {
  direction: TrendDirection;
  strength: TrendStrength;
  maAlignment: string;
  higherHighs: boolean;
  higherLows: boolean;
}

// ===== Support / Resistance =====

export interface PriceLevel {
  price: number;
  strength: number; // 1-5
  type: 'support' | 'resistance';
  touchCount: number;
}

// ===== Derivatives Analysis =====

export type OIPriceSignal =
  | 'new_longs'       // OI↑ Price↑
  | 'short_cover'     // OI↓ Price↑
  | 'new_shorts'      // OI↑ Price↓
  | 'long_liquidation' // OI↓ Price↓
  | 'neutral';

export interface DerivativesAnalysis {
  oiPriceSignal: OIPriceSignal;
  oiPriceDescription: string;
  fundingBias: 'long_heavy' | 'short_heavy' | 'neutral';
  fundingRate: number;
  premium: number;
  premiumSignal: 'bullish' | 'bearish' | 'neutral';
}

// ===== Trading Signal =====

export interface TradeSetup {
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  riskRewardRatio: number;
  riskPercent: number;
  rewardPercent: number;
}

export type SignalConclusion = 'enter_long' | 'enter_short' | 'wait' | 'skip';

export interface BreakoutLevel {
  price: number;
  direction: 'bullish_above' | 'bearish_below';
  description: string;
}

// ===== Per-Timeframe Analysis =====

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  trend: TrendAnalysis;
  indicators: IndicatorValues;
  patterns: CandlePattern[];
  levels: PriceLevel[];
  recentHigh: number;
  recentLow: number;
}

// ===== Full Analysis Result =====

export interface AnalysisResult {
  // ① Market Data Summary
  marketSummary: {
    symbol: string;
    timeframes: Timeframe[];
    currentPrice: number;
    priceChangePercent: number;
    volume24h: number;
    openInterest: number;
    fundingRate: number;
    premium: number;
    recentHigh: number;
    recentLow: number;
  };
  // Per-timeframe breakdown
  timeframeDetails: TimeframeAnalysis[];
  // ② Trend Judgment (combined)
  trend: TrendAnalysis;
  // ③ Support / Resistance (merged)
  levels: PriceLevel[];
  // ④ PR Comparison
  longSetup: TradeSetup;
  shortSetup: TradeSetup;
  // ⑤ Breakout Levels
  breakoutLevels: BreakoutLevel[];
  // ⑥ Conclusion
  conclusion: SignalConclusion;
  conclusionReason: string;
  // Extra (from primary timeframe)
  indicators: IndicatorValues;
  patterns: CandlePattern[];
  derivatives: DerivativesAnalysis;
}

// ===== AI =====

export type AIProvider = 'openai' | 'anthropic';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
}
