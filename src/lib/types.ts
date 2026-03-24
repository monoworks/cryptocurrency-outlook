// ===== Asset Category Types =====

export type AssetCategory = 'crypto' | 'stock' | 'commodity' | 'fx' | 'index';

export interface SymbolInfo {
  displayName: string;  // e.g., "TSLA", "BTC"
  apiCoin: string;      // e.g., "xyz:TSLA", "BTC"
  category: AssetCategory;
}

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

export type TradingStyle = 'scalping' | 'day_trade' | 'swing';

export interface TradingStyleConfig {
  style: TradingStyle;
  label: string;
  /** このスタイルで使用するタイムフレーム（低い順） */
  timeframes: Timeframe[];
  /** 各タイムフレームの重み付け */
  weights: Record<Timeframe, number>;
  /** 各タイムフレームの役割 */
  roles: {
    environment: Timeframe;   // 環境認識（最上位）
    setup: Timeframe;         // セットアップゾーン
    trigger: Timeframe;       // エントリートリガー
    execution: Timeframe;     // 執行タイミング
  };
  /** 最大保有時間（ミリ秒） */
  maxHoldingMs: number;
}

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
  stochRsi: { k: number; d: number } | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  vwap: number | null;
  bollingerBands: { upper: number; middle: number; lower: number } | null;
  adx: number | null;
  atr: number | null;
}

// ===== Divergence =====

export interface Divergence {
  type: 'bullish' | 'bearish' | 'hidden_bullish' | 'hidden_bearish';
  indicator: 'rsi' | 'macd';
  description: string;
}

// ===== Signal Confidence =====

export interface SignalConfidence {
  score: number; // 0-100
  label: string;
  factors: { name: string; contribution: number; positive: boolean }[];
  missingData?: string[];
}

// ===== Top Trader Ratio =====

export interface TopTraderRatio {
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
}

// ===== Market Regime =====

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'quiet';

export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  label: string;
  description: string;
  bbWidth: number;
  atrPercent: number;
  adx: number;
  volatilityRank: 'high' | 'normal' | 'low';
}

// ===== Volume Profile =====

export interface VolumeProfileLevel {
  priceMin: number;
  priceMax: number;
  priceMid: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  percentage: number;
}

export interface VolumeProfileAnalysis {
  poc: number;
  pocVolume: number;
  valueAreaHigh: number;
  valueAreaLow: number;
  levels: VolumeProfileLevel[];
  currentPriceVsVA: 'above' | 'inside' | 'below';
  description: string;
}

// ===== Liquidation Levels =====

export interface LiquidationLevel {
  price: number;
  side: 'long' | 'short';
  leverage: number;
  intensity: 'high' | 'medium' | 'low';
  description: string;
}

export interface LiquidationAnalysis {
  levels: LiquidationLevel[];
  nearestLongLiq: number | null;
  nearestShortLiq: number | null;
  magnetZone: string | null;
}

// ===== Order Flow =====

export interface OrderFlowAnalysis {
  takerBuyRatio: number;
  takerSellRatio: number;
  imbalance: number;
  recentImbalance: number;
  trend: 'buy_dominant' | 'sell_dominant' | 'balanced';
  description: string;
}

// ===== Divergence Aggregation =====

export interface DivergenceAggregation {
  bullishCount: number;
  bearishCount: number;
  weightedBullish: number;
  weightedBearish: number;
  netSignal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  description: string;
}

// ===== Sentiment =====

export interface FearGreedData {
  value: number;
  label: string;
  timestamp: number;
  previousValue?: number;
  change?: number;
}

export interface SentimentAnalysis {
  fearGreed?: FearGreedData;
  description: string;
  signal: 'contrarian_bullish' | 'contrarian_bearish' | 'confirming' | 'neutral';
}

// ===== False Breakout / Wick Rejection =====

export interface FalseBreakout {
  level: number;
  direction: 'upside_fakeout' | 'downside_fakeout';
  description: string;
}

export interface WickRejectionZone {
  price: number;
  count: number;
  side: 'upper' | 'lower';
  description: string;
}

export interface VolumeSpike {
  time: number;
  volumeRatio: number;
  priceDirection: 'up' | 'down';
  description: string;
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
  | 'consecutive_bearish'
  // Chart formations
  | 'double_top'
  | 'double_bottom'
  | 'ascending_triangle'
  | 'descending_triangle'
  | 'symmetrical_triangle'
  | 'bull_flag'
  | 'bear_flag'
  | 'rising_wedge'
  | 'falling_wedge';

export interface CandlePattern {
  type: PatternType;
  label: string;
  signal: 'bullish' | 'bearish' | 'neutral';
}

// ===== Trend =====

export type TrendDirection = 'uptrend' | 'downtrend' | 'range';
export type TrendStrength = 'strong' | 'moderate' | 'weak';

export interface TrendDebugInfo {
  candleCount: number;
  firstCandleTime: string | null;
  lastCandleTime: string | null;
  rangeHigh: number | null;
  rangeLow: number | null;
  rangePercent: number | null;
  currentPrice: number;
  pricePositionInRange: number | null;
  swingHighs: number[];
  swingLows: number[];
  lowerHighs: boolean;
  lowerLows: boolean;
  hhhlDirection: string;
  maScore: number;
  rangeBasedBias: string;
  dynamicThreshold: number | null;
  rangeLookbackCount: number;
  ema20: number | null;
  ema50: number | null;
  sma200: number | null;
  adx: number | null;
}

export interface TrendAnalysis {
  direction: TrendDirection;
  strength: TrendStrength;
  maAlignment: string;
  higherHighs: boolean;
  higherLows: boolean;
  _debug?: TrendDebugInfo;
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

export interface DerivativesHistory {
  oiHistory: { time: number; oi: number }[];
  fundingHistory: { time: number; rate: number }[];
}

export interface OIChange {
  current: number;
  previous: number;
  changePercent: number;
  direction: 'increasing' | 'decreasing' | 'stable';
}

export interface FundingTrend {
  current: number;
  average: number;
  trend: 'rising' | 'falling' | 'stable';
  isOverheated: boolean;
}

export interface OiResidualAnalysis {
  /** 直近の大きな価格変動（%） */
  recentPriceMove: number;
  /** その間の OI 変化率（%） */
  oiChangeRate: number;
  /** OI 残存率: |oiChangeRate / recentPriceMove| */
  residualRatio: number;
  /** 判定 */
  status: 'positions_cleared' | 'positions_remaining' | 'positions_building' | 'neutral';
  /** ボラティリティ予測への影響 */
  volatilityBias: 'high' | 'normal' | 'low';
  description: string;
}

export interface DerivativesAnalysis {
  oiPriceSignal: OIPriceSignal;
  oiPriceDescription: string;
  fundingBias: 'long_heavy' | 'short_heavy' | 'neutral';
  fundingRate: number;
  premium: number;
  premiumSignal: 'bullish' | 'bearish' | 'neutral';
  oiChange?: OIChange;
  fundingTrend?: FundingTrend;
  markOracleDivergence?: number;
  oiResidual?: OiResidualAnalysis;
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
  suggestedMaxHoldingMs?: number;  // タイムフレーム重みから算出した推奨最大保有時間（ミリ秒）
  tradingStyle?: TradingStyle;     // トレードスタイル
}

export type SignalConclusion = 'enter_long' | 'enter_short' | 'wait' | 'skip';

export interface BreakoutLevel {
  price: number;
  direction: 'bullish_above' | 'bearish_below';
  description: string;
}

// ===== Volume Breakout =====

export interface VolumeBreakout {
  level: number;
  direction: 'bullish' | 'bearish';
  volumeRatio: number; // vs average
  description: string;
}

// ===== Pullback / Retest =====

export interface PullbackAnalysis {
  fibLevel: number; // 0.236, 0.382, 0.5, 0.618, 0.786
  depth: 'shallow' | 'moderate' | 'deep';
  retestDetected: boolean;
  retestLevel?: number;
  description: string;
}

// ===== Hierarchical Analysis =====

export type MarketBias = 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';

export interface HierarchicalAnalysis {
  dailyBias: MarketBias;
  h4WavePosition: string;
  h1Strategy: string;
  entryTimeframe: string;
  description: string;
  /** 環境認識足のラベル（トレードスタイルにより変動） */
  environmentLabel?: string;
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
  volumeBreakouts?: VolumeBreakout[];
  pullback?: PullbackAnalysis;
  prevDayHigh?: number;
  prevDayLow?: number;
  falseBreakouts?: FalseBreakout[];
  wickRejections?: WickRejectionZone[];
  volumeSpikes?: VolumeSpike[];
  divergences?: Divergence[];
  volumeProfile?: VolumeProfileAnalysis;
}

// ===== Full Analysis Result =====

export interface AnalysisResult {
  // Trading style used for this analysis
  tradingStyle?: TradingStyle;
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
    prevDayHigh?: number;
    prevDayLow?: number;
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
  // ⑥ Conclusion (technical only)
  conclusion: SignalConclusion;
  conclusionReason: string;
  /** カウンタートレンド警告（環境認識足に逆行するエントリー時） */
  counterTrendWarning?: string;
  /** カウンタートレンドの最低PR要件 */
  counterTrendMinPR?: number;
  // ⑥-b Conclusion (news-adjusted, experimental)
  newsAdjustedConclusion?: SignalConclusion;
  newsAdjustedReason?: string;
  // Extra (from primary timeframe)
  indicators: IndicatorValues;
  patterns: CandlePattern[];
  derivatives: DerivativesAnalysis;
  // Hierarchical analysis
  hierarchical?: HierarchicalAnalysis;
  // Signal confidence
  confidence?: SignalConfidence;
  // Top trader ratio
  topTraderRatio?: TopTraderRatio;
  // Market regime
  marketRegime?: MarketRegimeAnalysis;
  // Volume profile (primary timeframe)
  volumeProfile?: VolumeProfileAnalysis;
  // Volume profile per timeframe (VRVP)
  timeframeVolumeProfiles?: { timeframe: Timeframe; profile: VolumeProfileAnalysis }[];
  // Liquidation levels
  liquidation?: LiquidationAnalysis;
  // Order flow
  orderFlow?: OrderFlowAnalysis;
  // Divergence aggregation
  divergenceAggregation?: DivergenceAggregation;
  // Sentiment
  sentiment?: SentimentAnalysis;
  // Economic calendar
  economicCalendar?: EconomicCalendarAnalysis;
  // News analysis
  newsAnalysis?: NewsAnalysis;
  // Whale activity detection
  whaleActivity?: WhaleActivity;
  // Crowd psychology signal
  crowdPsychology?: import('./crowd-psychology').CrowdPsychologySignal;
}

// ===== Economic Calendar =====

export interface EconomicEvent {
  event: string;
  country: string;
  time: string;           // ISO datetime (UTC)
  timeJST: string;        // JST formatted string for display
  impact: 'high' | 'medium' | 'low';
  forecast?: string;
  prev?: string;
}

export interface EconomicCalendarAnalysis {
  events: EconomicEvent[];
  hasHighImpact: boolean;
  nearestHighImpact?: {
    event: string;
    hoursUntil: number;
    timeJST: string;
  };
  warningLevel: 'none' | 'caution' | 'danger';
  description: string;
  confidenceImpact: number;   // 0 to -15
}

// ===== News =====

export type NewsTag = 'crypto' | 'geopolitical';
export type NewsImpact = 'high' | 'medium' | 'low';

export interface NewsArticle {
  title: string;
  description: string | null;
  link: string;
  source: string;
  pubDate: string;
  pubDateJST: string;
  category: string[];
  tag: NewsTag;
  relevanceScore: number;   // 0-10: crypto price relevance
  impact: NewsImpact;       // high/medium/low impact on crypto
}

export interface NewsAnalysis {
  articles: NewsArticle[];
  highImpactCount: number;
  netSentiment: 'risk_off' | 'risk_on' | 'neutral';  // market-wide risk tone
  sentimentScore: number;    // -1 (extreme risk-off) to +1 (risk-on)
  description: string;
}

// ===== Whale Detection =====

export interface WhaleTrade {
  time: number;
  price: number;
  quoteQty: number;       // trade size in USD
  side: 'buy' | 'sell';
}

export interface WhaleWall {
  price: number;
  quoteQty: number;       // wall size in USD
  side: 'bid' | 'ask';
}

export interface WhaleActivity {
  largeTrades: WhaleTrade[];
  largeTradeCount: number;
  buyVolume: number;       // total large buy volume (USD)
  sellVolume: number;      // total large sell volume (USD)
  netFlow: number;         // buy - sell (positive = accumulation)
  walls: WhaleWall[];
  bidWallVolume: number;   // total bid wall volume (USD)
  askWallVolume: number;   // total ask wall volume (USD)
  signal: 'accumulation' | 'distribution' | 'neutral';
  description: string;
}

// ===== AI =====

export type AIProvider = 'openai' | 'anthropic';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

// ===== Saved Position =====

export type PositionStatus = 'pending' | 'open' | 'closed';
export type CloseReason = 'manual' | 'stop_loss' | 'take_profit' | 'timeout';

export interface SavedPosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  amount: number;
  leverage: number;
  status: PositionStatus;
  createdAt: number;
  filledAt?: number;
  closedAt?: number;
  closedPrice?: number;
  closedPnl?: number;
  closeReason?: CloseReason;
  maxHoldingMs?: number;       // 推奨最大保有時間（ミリ秒）
  tradingStyle?: TradingStyle; // トレードスタイル（スキャルピング/デイトレード/スイング）
}
