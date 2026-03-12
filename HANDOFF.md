# Cryptocurrency Outlook - 開発引き継ぎドキュメント

## プロジェクト概要

暗号通貨のトレーディングシグナル分析ツール。Binance Futures の公開APIからリアルタイムデータを取得し、テクニカル分析・サポレジ検出・PR比較・ポジション管理を提供する Next.js アプリ。

- **フレームワーク**: Next.js 14.2 + React 18 + TypeScript 5
- **スタイリング**: Tailwind CSS (ダークテーマ)
- **デプロイ**: Vercel (東京リージョン hnd1 推奨)
- **UI言語**: 日本語

---

## セットアップ手順

```bash
git clone <repo-url>
cd cryptocurrency-outlook
git checkout claude/trading-signal-calculator-ZZPiK
npm install
npm run dev    # http://localhost:3000
```

### 環境変数

サーバー側の環境変数は不要。Binance Futures 公開APIは認証不要。
AI分析機能を使う場合のAPIキーはブラウザの localStorage に保存される。

---

## ブランチ情報

- **開発ブランチ**: `claude/trading-signal-calculator-ZZPiK`
- 最新コミット: `ac74ef1` (PR比較を成行ベースから指値ベースに変更)

---

## アーキテクチャ

```
src/
├── app/
│   ├── page.tsx              # メインページ (クライアントコンポーネント)
│   ├── layout.tsx            # ルートレイアウト
│   ├── globals.css           # グローバルスタイル
│   └── api/
│       ├── analyze/route.ts  # メイン分析API (Binanceデータ取得→シグナル生成)
│       └── ai-analyze/route.ts # AI分析API (OpenAI/Anthropic, 現在無効)
├── components/               # UIコンポーネント (14ファイル)
├── hooks/                    # カスタムフック (2ファイル)
└── lib/                      # ビジネスロジック (9ファイル)
```

### コンポーネント一覧

| コンポーネント | 役割 |
|---|---|
| `SymbolInput` | 銘柄入力 (例: BTCUSDT) |
| `MarketSummary` | 現在価格・24h変動・出来高 |
| `TrendBadge` | トレンド表示 (各タイムフレーム) |
| `SRLevels` | サポート・レジスタンスレベル |
| `PRComparison` | ④ PR比較 (Long vs Short, 指値ベース) |
| `PositionSimulator` | 売買シミュレーター |
| `BreakoutLevels` | 重要分岐点 |
| `Conclusion` | 総合判定・シグナル |
| `CopyPrompt` | 分析結果テキストコピー |
| `PositionManager` | シミュレーションの登録ポジション管理 |
| `HelpTip` | ツールチップ (初心者向け) |
| `AIAnalysis` | AI分析 (現在無効) |
| `AISettings` | AI設定 (現在無効) |
| `ImageUpload` | 画像アップロード (現在無効) |

### ライブラリ (src/lib/)

| ファイル | 役割 |
|---|---|
| `types.ts` | 全型定義 |
| `binance.ts` | Binance Futures API ラッパー |
| `signal.ts` | シグナル生成ロジック (中核) |
| `trend.ts` | トレンド分析 |
| `support-resistance.ts` | サポレジ検出 |
| `indicators.ts` | テクニカル指標 (RSI, MACD, BB等) |
| `patterns.ts` | チャートパターン認識 |
| `derivatives.ts` | デリバティブ分析 (FR, OI) |
| `prompt-builder.ts` | AI分析用プロンプト生成 |

### カスタムフック (src/hooks/)

| フック | 役割 |
|---|---|
| `useLivePrice.ts` | リアルタイム価格フェッチ |
| `useSavedPositions.ts` | ポジション永続化 (localStorage) |

---

## 主要な設計判断・実装済み機能

### 1. マルチタイムフレーム分析
5m / 15m / 1h / 4h / 1d の5つのタイムフレームで分析。重み付け (`TIMEFRAME_WEIGHT`) で日足ほど影響力が大きい。

### 2. PR比較 (指値ベース) ← 最新変更
- **ロング**: 押し目買い。エントリーはサポート付近 (`nearestSupport`)
- **ショート**: 戻り売り。エントリーはレジスタンス付近 (`nearestResistance`)
- 損切りはエントリーの0.2%外側
- 成行ベース(現在値をエントリーとする)ではなく、実戦的な指値想定

### 3. ポジション管理
- localStorage でポジションを永続化
- オープン/クローズ状態の管理
- 決済機能で確定損益を記録
- リセットボタンで全ポジション削除
- 「シミュレーションの登録ポジション」と明示 (実取引との誤認防止)

### 4. Binance API
- 東京リージョン (hnd1) 指定で 451 エラー回避
- 公開API使用、認証不要

### 5. 無効化中の機能
- AI分析 (OpenAI / Anthropic) - UIから非表示、コードは残存
- 画像アップロード分析 - 同上

---

## コミット履歴 (新→旧)

```
ac74ef1 PR比較を成行ベースから指値ベースに変更
f0f7a89 登録ポジションのラベルをシミュレーションと明示
1caf224 feat: ポジション決済機能・確定損益累計・リセットボタン追加
b98f427 fix: 合計金額が常に表示されるよう修正
39d6b20 feat: リアルタイム損益トラッキング & ポジション管理機能を追加
6628112 feat: 損益シミュレーター機能を追加
bd529e8 chore: AI分析設定・画像アップロード・AI分析をUIから非表示
ff6bf6e feat: AI分析設定に従量課金の注意書きを追加
80f3ebe feat: 初心者向けヘルプツールチップを全セクションに追加
f45100e feat: マルチタイムフレーム分析機能を追加
1cb8d9f fix: Binance API 451エラーを東京リージョン指定で解消
04760c8 chore: add default README.md from create-next-app
f034c87 feat: Cryptocurrency Trading Signal Calculator
```

---

## 開発コマンド

```bash
npm run dev     # 開発サーバー起動
npm run build   # プロダクションビルド
npm run lint    # ESLint 実行
npm start       # プロダクションサーバー起動
```

---

## 今後の拡張候補

- AI分析機能の再有効化 (UIは非表示だがコード残存)
- 画像分析機能の再有効化
- ポジション管理のサーバーサイド永続化 (現在はlocalStorage)
- アラート・通知機能
- 複数銘柄の同時分析
