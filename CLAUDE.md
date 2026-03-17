# Cryptocurrency Outlook — プロジェクト仕様書

## 概要

仮想通貨トレーディングシグナル分析ツール。マルチタイムフレーム技術分析、デリバティブ分析、ニュース・センチメントを統合し、エントリーシグナルを生成する。

- **フレームワーク**: Next.js 14.2 (App Router) + React 18 + TypeScript 5
- **チャート**: lightweight-charts v5 (TradingView)
- **スタイル**: Tailwind CSS (ダークテーマ + 6テーマ切替)
- **デプロイ**: Vercel (東京リージョン hnd1)
- **言語**: UIは日本語

## コマンド

```bash
npm run dev      # 開発サーバー (localhost:3000)
npm run build    # プロダクションビルド
npm run lint     # ESLint
npx tsc --noEmit # 型チェック
```

## アーキテクチャ

```
src/
├── app/
│   ├── page.tsx              # メインページ
│   └── api/                  # APIルート (11エンドポイント)
├── components/               # UIコンポーネント (20ファイル)
├── hooks/                    # カスタムフック (2ファイル)
└── lib/                      # 分析モジュール (21ファイル)
```

### データフロー

```
ユーザー入力 (シンボル + タイムフレーム)
  → /api/analyze (メインオーケストレータ)
  → 並列データ取得 (Hyperliquid / Binance)
  → generateSignal() (signal.ts)
  → AnalysisResult JSON → クライアント描画
```

## 実装済み機能一覧

### データソース

| ソース | 認証 | 用途 |
|--------|------|------|
| Hyperliquid API | 不要 | ローソク足、OI、資金調達率、板情報、約定履歴 |
| Binance Futures API | 不要 | ローソク足(Taker買い出来高付き)、OI履歴、Top Trader比率 |
| Alternative.me | 不要 | Fear & Greed Index |
| Forex Factory | 不要 | 経済カレンダー |
| RSS Feeds (CoinTelegraph等) | 不要 | ニュース取得 |

### テクニカル指標 (`indicators.ts`)

RSI(14), MACD(12/26/9), SMA(20/50/200), EMA(20/50), VWAP, ボリンジャーバンド(20,2σ), ADX(14), StochasticRSI(14/14/3/3), ATR(14)

### 分析モジュール

| モジュール | ファイル | 概要 |
|-----------|---------|------|
| トレンド分析 | `trend.ts` | HH/HL検出、MA配列、トレンド強度 |
| パターン検出 | `patterns.ts` | ローソク足パターン、チャートフォーメーション、偽ブレイクアウト、ウィック拒否 |
| サポレジ | `support-resistance.ts` | ピボットベース検出、クラスタリング、強度ランク |
| デリバティブ | `derivatives.ts` | OI×価格シグナル、資金調達率過熱、プレミアム指数 |
| ボリュームプロファイル | `volume-profile.ts` | 30ビンVRVP、POC/VAH/VAL、買い/売りデルタ推定 |
| 清算レベル | `liquidation.ts` | 5x〜100xレバレッジの清算ゾーン、マグネット検出 |
| オーダーフロー | `order-flow.ts` | Taker買い/売り比率、インバランススコア |
| ダイバージェンス | `divergence.ts` | RSI/MACDダイバージェンス (通常/ヒドゥン) |
| マーケットレジーム | `market-regime.ts` | trending_up/down, ranging, volatile, quiet |
| ホエール検出 | `whale-detection.ts` | 大口取引、板の壁、集積/分配シグナル |
| ニュース | `news.ts` | ニュース集約、関連度スコアリング(0-10)、リスク方向タグ |
| センチメント | `sentiment.ts` | Fear & Greed、逆張りシグナル |
| 経済カレンダー | `economic-calendar.ts` | 高インパクトイベント予測、信頼度調整 |

### シグナル生成 (`signal.ts` — 中核モジュール)

- **結論タイプ**: `enter_long` / `enter_short` / `wait` / `skip`
- **エントリー**: 指値注文 (サポート/レジスタンスベース)
- **SL**: エントリーから±0.2%
- **タイムフレーム重み付け**: 1d(4x) > 4h(3x) > 1h(2x) > 15m(1.5x) > 5m(1x)
- **信頼度スコア**: 0-100 (weak/moderate/strong)
- **階層分析**: 日足バイアス → 4h波動 → 1hエントリータイミング
- **実験的調整**: ニュース感情 / ホエール活動による結論修正

### VRVP描画 (`VrvpPrimitive.ts`)

- 買い出来高(シアン) + 売り出来高(ピンク) の横並びスタック描画
- 買い/売り推定: `buyRatio = (close - low) / (high - low)` (価格アクションヒューリスティック)
- POC: 黄色ボーダー、VA内外で透明度差

### UIコンポーネント

| コンポーネント | 概要 |
|--------------|------|
| `DashboardView` | 統合ダッシュボード |
| `Conclusion` | シグナル結論 + 分析ブレークダウン |
| `HyperliquidChart` | TradingView風チャート + ボリュームプロファイル |
| `PRComparison` | ロング vs ショート比較 (指値ベース) |
| `PositionSimulator` | ポジション入力シミュレーション |
| `PositionManager` | ポジション管理・P&L追跡 |
| `NewsSection` | ニュース表示 + 関連度/インパクト |
| `MarketSummary` | 現在価格、24h変動、出来高、OI |

### APIルート

| ルート | 用途 |
|--------|------|
| `/api/analyze` | メインシグナル生成 |
| `/api/klines` | Binanceローソク足 |
| `/api/klines-hl` | Hyperliquidローソク足 |
| `/api/news` | ニュース取得 |
| `/api/economic-calendar` | 経済イベント |
| `/api/market-data` | 統合マーケットデータ |
| `/api/refresh-external` | キャッシュ更新 (cron, 30分間隔) |

## 設計原則

- **無料API優先**: 全コア機能は認証不要の無料APIで動作
- **積極的キャッシュ**: ニュース/Fear&Greed/経済カレンダーはインメモリキャッシュ
- **グレースフルフォールバック**: Hyperliquid → Binance のフォールバック
- **シミュレーション限定**: 実取引連携なし (安全性優先)
- **日本語UI**: 全ラベル・説明は日本語

## 環境変数 (オプション)

```
TELEGRAM_BOT_TOKEN=     # Telegram通知
TELEGRAM_CHAT_ID=       # 通知先チャット
```

コア機能は環境変数なしで動作する。
