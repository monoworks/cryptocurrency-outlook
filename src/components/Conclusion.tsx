'use client';

import { SignalConclusion, CandlePattern, DerivativesAnalysis, IndicatorValues, HierarchicalAnalysis, FalseBreakout, WickRejectionZone, VolumeSpike, SignalConfidence, Divergence, TopTraderRatio, MarketRegimeAnalysis, VolumeProfileAnalysis, LiquidationAnalysis, OrderFlowAnalysis, DivergenceAggregation, SentimentAnalysis, EconomicCalendarAnalysis, WhaleActivity, Timeframe } from '@/lib/types';
import HelpTip from './HelpTip';

const CONCLUSION_CONFIG: Record<SignalConclusion, { label: string; color: string; bg: string }> = {
  enter_long: { label: 'ロングエントリー推奨', color: 'text-green-400', bg: 'bg-green-900/30 border-green-500' },
  enter_short: { label: 'ショートエントリー推奨', color: 'text-red-400', bg: 'bg-red-900/30 border-red-500' },
  wait: { label: '引きつけて待機', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-500' },
  skip: { label: '見送り推奨', color: 'text-gray-400', bg: 'bg-gray-700/30 border-gray-500' },
};

const REGIME_CONFIG: Record<string, { color: string; icon: string }> = {
  trending_up: { color: 'text-green-400', icon: '📈' },
  trending_down: { color: 'text-red-400', icon: '📉' },
  ranging: { color: 'text-yellow-400', icon: '↔️' },
  volatile: { color: 'text-orange-400', icon: '⚡' },
  quiet: { color: 'text-blue-300', icon: '😴' },
};

interface Props {
  conclusion: SignalConclusion;
  reason: string;
  newsAdjustedConclusion?: SignalConclusion;
  newsAdjustedReason?: string;
  patterns: CandlePattern[];
  derivatives: DerivativesAnalysis;
  indicators: IndicatorValues;
  hierarchical?: HierarchicalAnalysis;
  falseBreakouts?: FalseBreakout[];
  wickRejections?: WickRejectionZone[];
  volumeSpikes?: VolumeSpike[];
  confidence?: SignalConfidence;
  divergences?: Divergence[];
  topTraderRatio?: TopTraderRatio;
  marketRegime?: MarketRegimeAnalysis;
  volumeProfile?: VolumeProfileAnalysis;
  timeframeVolumeProfiles?: { timeframe: Timeframe; profile: VolumeProfileAnalysis }[];
  liquidation?: LiquidationAnalysis;
  orderFlow?: OrderFlowAnalysis;
  divergenceAggregation?: DivergenceAggregation;
  sentiment?: SentimentAnalysis;
  economicCalendar?: EconomicCalendarAnalysis;
  whaleActivity?: WhaleActivity;
}

export default function Conclusion({ conclusion, reason, newsAdjustedConclusion, newsAdjustedReason, patterns, derivatives, indicators, hierarchical, falseBreakouts, wickRejections, volumeSpikes, confidence, divergences, topTraderRatio, marketRegime, volumeProfile, timeframeVolumeProfiles, liquidation, orderFlow, divergenceAggregation, sentiment, economicCalendar, whaleActivity }: Props) {
  const config = CONCLUSION_CONFIG[conclusion];
  const newsConfig = newsAdjustedConclusion ? CONCLUSION_CONFIG[newsAdjustedConclusion] : null;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">結論（テクニカル分析のみ）</h2>
      <div className={`border rounded-lg p-4 ${config.bg}`}>
        <div className={`text-xl font-bold ${config.color} mb-2`}>{config.label}</div>
        <p className="text-gray-300 text-sm">{reason}</p>
      </div>

      {newsConfig && newsAdjustedReason && (
        <div className="mt-4">
          <h2 className="text-lg font-bold text-white mb-3">結論（ニュース要素加味 <span className="text-xs font-normal text-gray-400">※試行中</span>）</h2>
          <div className={`border rounded-lg p-4 ${newsConfig.bg}`}>
            <div className={`text-xl font-bold ${newsConfig.color} mb-2`}>{newsConfig.label}</div>
            <p className="text-gray-300 text-sm">{newsAdjustedReason}</p>
          </div>
        </div>
      )}

      {/* Economic Calendar Alert */}
      {economicCalendar && (
        <div className={`mt-3 border rounded-lg p-3 ${
          economicCalendar.warningLevel === 'danger'
            ? 'border-red-500 bg-red-900/20'
            : economicCalendar.warningLevel === 'caution'
              ? 'border-yellow-500 bg-yellow-900/20'
              : 'border-gray-600'
        }`}>
          <h4 className={`font-semibold text-sm mb-1 ${
            economicCalendar.warningLevel === 'danger' ? 'text-red-400'
              : economicCalendar.warningLevel === 'caution' ? 'text-yellow-400'
              : 'text-gray-400'
          }`}>
            {economicCalendar.warningLevel === 'danger' ? '⚠ 重要経済指標 発表間近' : '経済指標カレンダー'}
            <HelpTip text="FOMC、CPI、雇用統計等の重要経済指標の発表前後は急変動リスクがあります。発表時刻は日本時間(JST)で表示しています" />
          </h4>
          <div className={`text-xs mb-2 ${
            economicCalendar.warningLevel === 'danger' ? 'text-red-300'
              : economicCalendar.warningLevel === 'caution' ? 'text-yellow-300'
              : 'text-gray-500'
          }`}>
            {economicCalendar.description}
          </div>
          {economicCalendar.events.length > 0 && (
            <div className="space-y-1">
              {economicCalendar.events.filter((e) => e.impact === 'high' || e.impact === 'medium').slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    e.impact === 'high' ? 'bg-red-800 text-red-200' : 'bg-yellow-800 text-yellow-200'
                  }`}>
                    {e.impact === 'high' ? '高' : '中'}
                  </span>
                  <span className="text-gray-400">{e.timeJST}</span>
                  <span className="text-gray-300">{e.event}</span>
                  {e.forecast && <span className="text-gray-500">予想: {e.forecast}</span>}
                  {e.prev && <span className="text-gray-500">前回: {e.prev}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Market Regime + Sentiment row */}
      {(marketRegime || sentiment) && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {marketRegime && (
            <div className="border border-gray-600 rounded-lg p-3">
              <h4 className="text-gray-400 font-semibold text-sm mb-1">マーケットレジーム<HelpTip text="現在の市場状態を分類。戦略選択の基盤となります" /></h4>
              <div className={`text-sm font-bold ${REGIME_CONFIG[marketRegime.regime]?.color ?? 'text-gray-300'}`}>
                {REGIME_CONFIG[marketRegime.regime]?.icon} {marketRegime.label}
              </div>
              <div className="text-xs text-gray-400 mt-1">{marketRegime.description}</div>
              <div className="flex gap-2 mt-1 text-xs text-gray-500">
                <span>BB幅: {marketRegime.bbWidth.toFixed(1)}%</span>
                <span>ATR: {marketRegime.atrPercent.toFixed(2)}%</span>
                <span>ADX: {marketRegime.adx.toFixed(0)}</span>
              </div>
            </div>
          )}
          {sentiment && (
            <div className="border border-gray-600 rounded-lg p-3">
              <h4 className="text-gray-400 font-semibold text-sm mb-1">センチメント<HelpTip text="Fear & Greed Index。極端な恐怖は買い、極端な貪欲は売りの逆張りシグナル" /></h4>
              {sentiment.fearGreed ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${sentiment.fearGreed.value <= 25 ? 'bg-red-500' : sentiment.fearGreed.value <= 45 ? 'bg-orange-500' : sentiment.fearGreed.value <= 55 ? 'bg-yellow-500' : sentiment.fearGreed.value <= 75 ? 'bg-lime-500' : 'bg-green-500'}`}
                        style={{ width: `${sentiment.fearGreed.value}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-300">{sentiment.fearGreed.value}</span>
                  </div>
                  <div className={`text-xs ${sentiment.signal === 'contrarian_bullish' ? 'text-green-400' : sentiment.signal === 'contrarian_bearish' ? 'text-red-400' : 'text-gray-400'}`}>
                    {sentiment.description}
                  </div>
                </>
              ) : (
                <div className="text-xs text-gray-500">{sentiment.description}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confidence Score */}
      {confidence && (
        <div className="mt-3 border border-gray-600 rounded-lg p-3">
          <h4 className="text-gray-400 font-semibold text-sm mb-2">シグナル信頼度<HelpTip text="各種指標の一致度からシグナルの信頼性を0-100%で評価します" /></h4>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${confidence.score >= 70 ? 'bg-green-500' : confidence.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${confidence.score}%` }}
              />
            </div>
            <span className={`font-bold text-sm ${confidence.score >= 70 ? 'text-green-400' : confidence.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {confidence.score}% ({confidence.label})
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {confidence.factors.map((f, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded ${f.positive ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {f.positive ? '+' : '-'}{f.contribution} {f.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Volume Profile + Order Flow + Divergence Aggregation row */}
      {(volumeProfile || orderFlow || divergenceAggregation) && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(timeframeVolumeProfiles && timeframeVolumeProfiles.length > 0) ? (
            <div className="border border-gray-600 rounded-lg p-3">
              <h4 className="text-gray-400 font-semibold text-sm mb-2">VRVP (各足)<HelpTip text="時間足別の価格帯別出来高。各足でPOC・Value Areaを算出し、多足一致で信頼度が上がります" /></h4>
              <div className="space-y-1.5">
                {timeframeVolumeProfiles.map(({ timeframe, profile }) => (
                  <div key={timeframe} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-8 shrink-0">{timeframe}</span>
                    <span className="text-gray-300">POC ${profile.poc.toFixed(0)}</span>
                    <span className="text-gray-500">VA ${profile.valueAreaLow.toFixed(0)}-${profile.valueAreaHigh.toFixed(0)}</span>
                    <span className={`${profile.currentPriceVsVA === 'above' ? 'text-green-400' : profile.currentPriceVsVA === 'below' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {profile.currentPriceVsVA === 'above' ? 'VA上' : profile.currentPriceVsVA === 'below' ? 'VA下' : 'VA内'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : volumeProfile ? (
            <div className="border border-gray-600 rounded-lg p-3">
              <h4 className="text-gray-400 font-semibold text-sm mb-1">Volume Profile<HelpTip text="価格帯別出来高。POC(最大出来高)とValue Area(70%出来高帯)を示します" /></h4>
              <div className="text-xs text-gray-300">POC: ${volumeProfile.poc.toFixed(0)}</div>
              <div className="text-xs text-gray-300">VA: ${volumeProfile.valueAreaLow.toFixed(0)} - ${volumeProfile.valueAreaHigh.toFixed(0)}</div>
              <div className={`text-xs mt-1 ${volumeProfile.currentPriceVsVA === 'above' ? 'text-green-400' : volumeProfile.currentPriceVsVA === 'below' ? 'text-red-400' : 'text-yellow-400'}`}>
                {volumeProfile.currentPriceVsVA === 'above' ? 'VA上方' : volumeProfile.currentPriceVsVA === 'below' ? 'VA下方' : 'VA内'}
              </div>
            </div>
          ) : null}
          {orderFlow && (
            <div className="border border-gray-600 rounded-lg p-3">
              <h4 className="text-gray-400 font-semibold text-sm mb-1">オーダーフロー<HelpTip text="Taker買い/売りの比率から短期の需給バランスを推定します" /></h4>
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-700 mb-1">
                <div className="bg-green-500" style={{ width: `${orderFlow.takerBuyRatio * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${orderFlow.takerSellRatio * 100}%` }} />
              </div>
              <div className={`text-xs ${orderFlow.trend === 'buy_dominant' ? 'text-green-400' : orderFlow.trend === 'sell_dominant' ? 'text-red-400' : 'text-gray-400'}`}>
                {orderFlow.description}
              </div>
            </div>
          )}
          {divergenceAggregation && (divergenceAggregation.bullishCount + divergenceAggregation.bearishCount > 0) && (
            <div className="border border-gray-600 rounded-lg p-3">
              <h4 className="text-gray-400 font-semibold text-sm mb-1">ダイバージェンス集約<HelpTip text="全時間足のダイバージェンスを加重集約した総合判定です" /></h4>
              <div className={`text-xs ${divergenceAggregation.netSignal === 'bullish' ? 'text-green-400' : divergenceAggregation.netSignal === 'bearish' ? 'text-red-400' : 'text-gray-400'}`}>
                {divergenceAggregation.description}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Divergences detail */}
      {divergences && divergences.length > 0 && (
        <div className="mt-3 border border-indigo-500/30 rounded-lg p-3 bg-indigo-900/10">
          <h4 className="text-indigo-400 font-semibold text-sm mb-2">ダイバージェンス検出<HelpTip text="価格とRSI/MACDの方向が乖離しているパターン。トレンド転換の予兆となります" /></h4>
          {divergences.map((d, i) => (
            <div key={i} className={`text-xs mb-1 ${d.type.includes('bullish') ? 'text-green-300' : 'text-red-300'}`}>
              {d.description}
            </div>
          ))}
        </div>
      )}

      {/* Top Trader Ratio */}
      {topTraderRatio && (
        <div className="mt-3 border border-gray-600 rounded-lg p-3">
          <h4 className="text-gray-400 font-semibold text-sm mb-2">トップトレーダー比率<HelpTip text="トップトレーダーのロング/ショート口座比率です" /></h4>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-green-400">Long {(topTraderRatio.longAccount * 100).toFixed(1)}%</span>
                <span className="text-red-400">Short {(topTraderRatio.shortAccount * 100).toFixed(1)}%</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-700">
                <div className="bg-green-500" style={{ width: `${topTraderRatio.longAccount * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${topTraderRatio.shortAccount * 100}%` }} />
              </div>
            </div>
            <span className="text-gray-300 text-xs">L/S比: {topTraderRatio.longShortRatio.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Whale Activity */}
      {whaleActivity && whaleActivity.largeTradeCount > 0 && (
        <div className={`mt-3 border rounded-lg p-3 ${
          whaleActivity.signal === 'accumulation' ? 'border-green-500/30 bg-green-900/10'
            : whaleActivity.signal === 'distribution' ? 'border-red-500/30 bg-red-900/10'
            : 'border-gray-600'
        }`}>
          <h4 className={`font-semibold text-sm mb-2 ${
            whaleActivity.signal === 'accumulation' ? 'text-green-400'
              : whaleActivity.signal === 'distribution' ? 'text-red-400'
              : 'text-gray-400'
          }`}>
            {whaleActivity.signal === 'accumulation' ? '🐋' : whaleActivity.signal === 'distribution' ? '🔴' : '🐳'} 大口動向検出
            <HelpTip text="直近約定と板情報から大口（クジラ）の売買動向を検出。蓄積=大口買い優勢、分配=大口売り優勢" />
          </h4>
          <div className="text-xs text-gray-300 mb-2">{whaleActivity.description}</div>
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-gray-500">大口買い: </span>
              <span className="text-green-400">${whaleActivity.buyVolume >= 1_000_000 ? `${(whaleActivity.buyVolume / 1_000_000).toFixed(1)}M` : `${(whaleActivity.buyVolume / 1_000).toFixed(0)}K`}</span>
            </div>
            <div>
              <span className="text-gray-500">大口売り: </span>
              <span className="text-red-400">${whaleActivity.sellVolume >= 1_000_000 ? `${(whaleActivity.sellVolume / 1_000_000).toFixed(1)}M` : `${(whaleActivity.sellVolume / 1_000).toFixed(0)}K`}</span>
            </div>
            {whaleActivity.walls.length > 0 && (
              <div>
                <span className="text-gray-500">壁: </span>
                <span className="text-gray-300">買壁${whaleActivity.bidWallVolume >= 1_000_000 ? `${(whaleActivity.bidWallVolume / 1_000_000).toFixed(1)}M` : `${(whaleActivity.bidWallVolume / 1_000).toFixed(0)}K`} / 売壁${whaleActivity.askWallVolume >= 1_000_000 ? `${(whaleActivity.askWallVolume / 1_000_000).toFixed(1)}M` : `${(whaleActivity.askWallVolume / 1_000).toFixed(0)}K`}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Liquidation Levels */}
      {liquidation && liquidation.levels.length > 0 && (
        <div className="mt-3 border border-amber-500/30 rounded-lg p-3 bg-amber-900/10">
          <h4 className="text-amber-400 font-semibold text-sm mb-2">清算レベル推定<HelpTip text="OIと価格帯から推定した清算集中ゾーン。価格が吸い寄せられやすい（磁石効果）" /></h4>
          {liquidation.magnetZone && (
            <div className="text-xs text-amber-300 mb-2">磁石ゾーン: {liquidation.magnetZone}</div>
          )}
          <div className="grid grid-cols-2 gap-1">
            {liquidation.levels.slice(0, 6).map((l, i) => (
              <div key={i} className={`text-xs ${l.side === 'long' ? 'text-red-300' : 'text-green-300'} ${l.intensity === 'high' ? 'font-bold' : ''}`}>
                ${l.price.toFixed(0)} ({l.side === 'long' ? 'L' : 'S'} {l.leverage}x) {l.intensity === 'high' ? '!!!' : l.intensity === 'medium' ? '!!' : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hierarchical analysis */}
      {hierarchical && (
        <div className="mt-3 border border-blue-500/30 rounded-lg p-3 bg-blue-900/10">
          <h4 className="text-blue-400 font-semibold text-sm mb-2">階層的分析 (日足→4h→1h→15m)<HelpTip text="上位足から順に方向性を確認し、下位足で具体的なエントリー位置を決める分析手法です" /></h4>
          <div className="text-sm text-gray-300 space-y-1">
            <div>日足バイアス: <span className={
              hierarchical.dailyBias.includes('bullish') ? 'text-green-400' :
              hierarchical.dailyBias.includes('bearish') ? 'text-red-400' : 'text-gray-400'
            }>
              {hierarchical.dailyBias === 'strongly_bullish' ? '強い強気' :
               hierarchical.dailyBias === 'bullish' ? '強気' :
               hierarchical.dailyBias === 'strongly_bearish' ? '強い弱気' :
               hierarchical.dailyBias === 'bearish' ? '弱気' : '中立'}
            </span></div>
            <div>4h波動: <span className="text-gray-200">{hierarchical.h4WavePosition}</span></div>
            <div>1h戦略: <span className="text-yellow-300">{hierarchical.h1Strategy}</span></div>
            <div>エントリー: <span className="text-gray-200">{hierarchical.entryTimeframe}</span></div>
          </div>
        </div>
      )}

      {/* Extra details */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        {/* Patterns */}
        <div>
          <h4 className="text-gray-400 font-semibold mb-1">ローソク足パターン<HelpTip text="チャートの形から読み取れる、次の値動きのヒントです" /></h4>
          {patterns.length === 0 ? (
            <p className="text-gray-500">特筆なし</p>
          ) : (
            patterns.map((p, i) => (
              <div key={i} className={`${p.signal === 'bullish' ? 'text-green-400' : p.signal === 'bearish' ? 'text-red-400' : 'text-gray-300'}`}>
                {p.label}
              </div>
            ))
          )}
        </div>

        {/* Derivatives */}
        <div>
          <h4 className="text-gray-400 font-semibold mb-1">デリバティブ<HelpTip text="先物・オプション市場の情報から読み取れる、トレーダーたちの心理です" /></h4>
          <div className="text-gray-300">{derivatives.oiPriceDescription}</div>
          <div className="text-gray-400 mt-1">
            Funding: <span className={derivatives.fundingBias === 'long_heavy' ? 'text-yellow-400' : derivatives.fundingBias === 'short_heavy' ? 'text-blue-400' : 'text-gray-300'}>
              {derivatives.fundingBias === 'long_heavy' ? 'ロング偏り' : derivatives.fundingBias === 'short_heavy' ? 'ショート偏り' : '中立'}
            </span>
            {derivatives.fundingTrend && (
              <span className="ml-1 text-xs">
                ({derivatives.fundingTrend.trend === 'rising' ? '上昇傾向' : derivatives.fundingTrend.trend === 'falling' ? '低下傾向' : '横ばい'}
                {derivatives.fundingTrend.isOverheated && ' ⚠過熱'})
              </span>
            )}
          </div>
          {derivatives.oiChange && (
            <div className="text-gray-400 mt-1">
              OI変化: <span className={derivatives.oiChange.direction === 'increasing' ? 'text-green-400' : derivatives.oiChange.direction === 'decreasing' ? 'text-red-400' : 'text-gray-300'}>
                {derivatives.oiChange.changePercent > 0 ? '+' : ''}{derivatives.oiChange.changePercent}%
              </span>
            </div>
          )}
          {derivatives.markOracleDivergence != null && Math.abs(derivatives.markOracleDivergence) > 0.001 && (
            <div className="text-gray-400 mt-1">
              Mark/Oracle乖離: <span className="text-gray-300">{derivatives.markOracleDivergence.toFixed(4)}%</span>
            </div>
          )}
        </div>

        {/* Key Indicators */}
        <div>
          <h4 className="text-gray-400 font-semibold mb-1">主要指標<HelpTip text="RSI（買われすぎ/売られすぎ）、MACD（勢い）、ADX（トレンドの強さ）を示します" /></h4>
          <div className="text-gray-300">RSI: {indicators.rsi?.toFixed(1) ?? 'N/A'}</div>
          <div className="text-gray-300">
            MACD: {indicators.macd ? (indicators.macd.histogram > 0 ? '強気' : '弱気') : 'N/A'}
          </div>
          <div className="text-gray-300">ADX: {indicators.adx?.toFixed(1) ?? 'N/A'}</div>
          {indicators.stochRsi && (
            <div className={`${indicators.stochRsi.k < 20 ? 'text-green-400' : indicators.stochRsi.k > 80 ? 'text-red-400' : 'text-gray-300'}`}>
              StochRSI: K={indicators.stochRsi.k.toFixed(0)} D={indicators.stochRsi.d.toFixed(0)}
              {indicators.stochRsi.k < 20 ? ' (売られすぎ)' : indicators.stochRsi.k > 80 ? ' (買われすぎ)' : ''}
            </div>
          )}
          {indicators.bollingerBands && (
            <div className="text-gray-300 text-xs mt-1">
              BB: {indicators.bollingerBands.lower.toFixed(0)}-{indicators.bollingerBands.upper.toFixed(0)}
            </div>
          )}
        </div>
      </div>

      {/* Additional signals row */}
      {((falseBreakouts && falseBreakouts.length > 0) || (wickRejections && wickRejections.length > 0) || (volumeSpikes && volumeSpikes.length > 0)) && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm border-t border-gray-700 pt-3">
          {/* False Breakouts */}
          {falseBreakouts && falseBreakouts.length > 0 && (
            <div>
              <h4 className="text-orange-400 font-semibold mb-1">ダマシ検出<HelpTip text="S/Rレベルを一旦抜けたがヒゲで戻された（偽ブレイク）パターンです" /></h4>
              {falseBreakouts.map((fb, i) => (
                <div key={i} className="text-gray-300 text-xs">{fb.description}</div>
              ))}
            </div>
          )}

          {/* Wick Rejections */}
          {wickRejections && wickRejections.length > 0 && (
            <div>
              <h4 className="text-purple-400 font-semibold mb-1">ヒゲ否定ゾーン<HelpTip text="何度もヒゲで否定されている価格帯。売り/買い圧力が集中しています" /></h4>
              {wickRejections.map((wr, i) => (
                <div key={i} className={`text-xs ${wr.side === 'upper' ? 'text-red-300' : 'text-green-300'}`}>{wr.description}</div>
              ))}
            </div>
          )}

          {/* Volume Spikes */}
          {volumeSpikes && volumeSpikes.length > 0 && (
            <div>
              <h4 className="text-cyan-400 font-semibold mb-1">出来高スパイク<HelpTip text="平均の2倍以上の出来高が発生。大口の参入や重要な値動きのサインです" /></h4>
              {volumeSpikes.map((vs, i) => (
                <div key={i} className={`text-xs ${vs.priceDirection === 'up' ? 'text-green-300' : 'text-red-300'}`}>{vs.description}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
