# 大口動向（クジラ検出）機能 — 実装ドキュメント

## 概要

Binanceの直近約定データと板情報（オーダーブック）から大口（クジラ）の売買動向を検出し、テクニカル分析とは**独立した試行セクション**として表示する機能です。

**ステータス:** 試行中（テクニカル結論のスコアリング・信頼度には影響しない）

---

## 結論セクションの構成

| セクション | 構成要素 | ステータス |
|---|---|---|
| **結論（テクニカル分析のみ）** | テクニカル指標のみ | 本番 |
| **結論（ニュース要素加味）** | テクニカル＋ニュース | 試行中 |
| **結論（大口動向加味）** | テクニカル＋大口動向 | 試行中 |

- 各セクションは独立しており、ニュース加味にクジラは含まれず、クジラ加味にニュースは含まれない
- テクニカル結論をベースに、それぞれの外部要因で調整する構造

---

## データソース

### 1. 直近約定（Aggregated Trades）

- **エンドポイント:** Binance `/fapi/v1/aggTrades`
- **取得件数:** 直近1,000件
- **ファイル:** `src/lib/binance.ts` — `getAggTrades()`

### 2. 板情報（Order Book Depth）

- **エンドポイント:** Binance `/fapi/v1/depth`
- **取得件数:** 500レベル
- **ファイル:** `src/lib/binance.ts` — `getOrderBookDepth()`

---

## 検出ロジック

**ファイル:** `src/lib/whale-detection.ts` — `analyzeWhaleActivity()`

### 大口約定の検出

1. 全約定のUSD価格の中央値を算出
2. 閾値 = `max(中央値 × 10, $50,000)`
3. 閾値を超える約定を「大口約定」として分類
4. 買い/売りの出来高を集計

### 板壁（ホエールウォール）の検出

1. 閾値 = `max(全約定出来高合計 × 1%, $200,000)`
2. 閾値を超える板を「壁」として検出
3. 現在価格からの距離でソートし、上位10件を表示

### シグナル判定

| シグナル | 条件 |
|---|---|
| **accumulation（蓄積）** | 大口買い比率 ≥ 65% または 板壁の買い比率 ≥ 70% |
| **distribution（分配）** | 大口買い比率 ≤ 35% または 板壁の買い比率 ≤ 30% |
| **neutral（中立）** | 上記以外 |

---

## 結論調整ロジック

**ファイル:** `src/lib/signal.ts` — `determineWhaleAdjustedConclusion()`

テクニカル結論をベースに、大口シグナルで以下のように調整する:

### テクニカルと大口が矛盾する場合（結論を変更）

| テクニカル結論 | 大口シグナル | 調整後 |
|---|---|---|
| ロングエントリー推奨 | distribution（売り抜け） | → **様子見** |
| ショートエントリー推奨 | accumulation（買い集め） | → **様子見** |

### テクニカルと大口が一致する場合（補強コメント）

| テクニカル結論 | 大口シグナル | 結果 |
|---|---|---|
| ロングエントリー推奨 | accumulation | 「大口の買い集めがロングシグナルを後押し」 |
| ショートエントリー推奨 | distribution | 「大口の売り抜けがショートシグナルを後押し」 |

### テクニカルが様子見の場合（方向性ヒント）

| 大口シグナル | コメント |
|---|---|
| accumulation | 「大口が買い集め中 — ロング方向優位の可能性」 |
| distribution | 「大口が売り抜け中 — ショート方向優位の可能性」 |

---

## UI表示

### WhaleBadge（ヘッダーバッジ）

**ファイル:** `src/components/DashboardView.tsx`

- ヘッダー行に経済指標・ニュースバッジと並んで表示
- クリックでポップアップ（直近の大口約定10件 + 板壁6件）
- 色分け: 蓄積=緑 / 分配=赤 / 中立=灰色

### 結論カード（大口動向加味 ※試行中）

**ファイル:** `src/components/DashboardView.tsx`, `src/components/Conclusion.tsx`, `src/app/page.tsx`

- テクニカル結論 → ニュース結論 → **大口動向結論** の順で表示
- テクニカル結論と同じカードスタイル（緑/赤/黄/灰）
- 大口約定が0件の場合は非表示

### 詳細セクション（Conclusion.tsx内）

- 大口約定件数、買い/売りボリューム（USD）
- 板壁情報（ある場合）
- ヘルプTip付き

---

## データフロー

```
Binance API
  ├─ /fapi/v1/aggTrades (直近1000約定)
  └─ /fapi/v1/depth (板情報500レベル)
        │
        ▼
analyzeWhaleActivity()        ← whale-detection.ts
        │
        ▼
generateSignal()              ← signal.ts
  ├─ determineConclusion()           → テクニカル結論（クジラ不使用）
  ├─ calcConfidence()                → 信頼度スコア（クジラ不使用）
  ├─ determineNewsAdjustedConclusion() → ニュース加味結論
  └─ determineWhaleAdjustedConclusion() → 大口加味結論（試行中）
        │
        ▼
AnalysisResult
  ├─ conclusion / conclusionReason
  ├─ newsAdjustedConclusion / newsAdjustedReason
  ├─ whaleAdjustedConclusion / whaleAdjustedReason  ← NEW
  └─ whaleActivity (生データ)
        │
        ▼
UI Components
  ├─ WhaleBadge (ヘッダー)
  ├─ 結論カード（大口動向加味 ※試行中）
  └─ 大口動向詳細セクション
```

---

## 型定義

**ファイル:** `src/lib/types.ts`

```typescript
interface WhaleTrade {
  time: number;
  price: number;
  quoteQty: number;       // USD
  side: 'buy' | 'sell';
}

interface WhaleWall {
  price: number;
  quoteQty: number;       // USD
  side: 'bid' | 'ask';
}

interface WhaleActivity {
  largeTrades: WhaleTrade[];
  largeTradeCount: number;
  buyVolume: number;       // 大口買い合計 (USD)
  sellVolume: number;      // 大口売り合計 (USD)
  netFlow: number;         // buy - sell（正=蓄積）
  walls: WhaleWall[];
  bidWallVolume: number;
  askWallVolume: number;
  signal: 'accumulation' | 'distribution' | 'neutral';
  description: string;
}
```

---

## ファイル一覧

| ファイル | 役割 |
|---|---|
| `src/lib/types.ts` | WhaleActivity 型定義 |
| `src/lib/binance.ts` | Binance API呼び出し（aggTrades, depth） |
| `src/lib/whale-detection.ts` | 大口検出・シグナル判定ロジック |
| `src/lib/signal.ts` | determineWhaleAdjustedConclusion() |
| `src/app/api/analyze/route.ts` | 単一銘柄分析API |
| `src/app/api/analyze-batch/route.ts` | バッチ分析API |
| `src/components/DashboardView.tsx` | WhaleBadge + ダッシュボード結論表示 |
| `src/components/Conclusion.tsx` | 詳細版結論表示 + 大口詳細セクション |
| `src/app/page.tsx` | 簡易版結論表示 |

---

## 今後の検討事項

- 様子見の結果、精度が確認できればテクニカル結論のスコアリングに組み込む可能性あり
- ニュース＋大口動向の両方を加味した総合結論セクションの追加
- 大口約定の閾値（現在: $50,000）の銘柄別最適化
