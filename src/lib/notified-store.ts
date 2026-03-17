/**
 * 配信済みニュース記事リンクの永続ストア。
 *
 * - KV_REST_API_URL + KV_REST_API_TOKEN が設定されていれば Upstash Redis で永続化
 * - 未設定時はインメモリ Set にフォールバック（コールドスタートでリセット）
 *
 * Redis: 各リンクを個別キー (SETEX) で保存し、24h TTL で自動削除。
 * キーが個別なので追加時に既存リンクの TTL がリセットされず、確実に期限切れになる。
 */

const KEY_PREFIX = 'notified:';
const TITLE_KEY_PREFIX = 'notified-title:';
const MAX_IN_MEMORY = 500;
const EXPIRE_SECONDS = 86400; // 24h

/**
 * タイトルを正規化して重複判定用キーを生成。
 * Google News が同じ記事に異なるURLを生成する問題に対処。
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// コールドスタート対策: Redis 未設定時、初回実行で古い記事を再送しないよう
// インスタンス起動時刻を記録し、pubDate がそれより古い記事をスキップする。
const INSTANCE_BOOT_TIME = Date.now();
// cron 間隔 × 2 のバッファ (5分間隔 → 10分)
const COLD_START_GRACE_MS = 10 * 60 * 1000;
let hasRunOnce = false;

// --------------- in-memory fallback ---------------
const memorySet = new Set<string>();
const memoryTitleSet = new Set<string>();

// --------------- Upstash Redis REST (pipeline) ---------------

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** Upstash REST pipeline — 複数コマンドを1リクエストで実行 */
async function redisPipeline(commands: string[][]): Promise<unknown[] | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) {
      console.error(`[notified-store] pipeline failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data as unknown[];
  } catch (err) {
    console.error('[notified-store] Redis error:', err);
    return null;
  }
}

// --------------- Public API ---------------

/**
 * 未配信の記事だけを返す。
 * Redis 設定時はサーバー側で EXISTS チェック、未設定時はインメモリ Set で判定。
 *
 * コールドスタート対策: Redis 未設定かつ初回実行時、pubDate がインスタンス起動前の
 * 記事はスキップする（再送防止）。pubDate フィールドがある記事のみ適用。
 */
export async function filterUnnotified<T extends { link: string; title?: string; pubDate?: string }>(articles: T[]): Promise<T[]> {
  if (articles.length === 0) return [];

  const cfg = kvConfig();
  if (!cfg) {
    // インメモリフォールバック — link + タイトル両方でチェック
    let filtered = articles.filter((a) => {
      if (memorySet.has(a.link)) return false;
      if (a.title) {
        const norm = normalizeTitle(a.title);
        if (norm && memoryTitleSet.has(norm)) return false;
      }
      return true;
    });

    // コールドスタート検出: memorySet が空 = 初回実行
    // pubDate がインスタンス起動より十分前の記事は「前回のインスタンスで既に送信済み」とみなしスキップ
    if (!hasRunOnce && memorySet.size === 0) {
      const cutoff = INSTANCE_BOOT_TIME - COLD_START_GRACE_MS;
      filtered = filtered.filter((a) => {
        if (!a.pubDate) return true; // pubDate が無い場合は通す
        const pubTime = new Date(a.pubDate).getTime();
        if (isNaN(pubTime)) return true; // パース不能は通す
        return pubTime >= cutoff;
      });
      hasRunOnce = true;
    }

    return filtered;
  }

  // Redis: link + title 両方の EXISTS を pipeline で一括チェック
  const commands: string[][] = [];
  for (const a of articles) {
    commands.push(['EXISTS', `${KEY_PREFIX}${a.link}`]);
    const norm = a.title ? normalizeTitle(a.title) : '';
    commands.push(['EXISTS', norm ? `${TITLE_KEY_PREFIX}${norm}` : `${KEY_PREFIX}${a.link}`]);
  }
  const results = await redisPipeline(commands);

  if (!results) {
    // Redis 障害時はインメモリにフォールバック
    return articles.filter((a) => {
      if (memorySet.has(a.link)) return false;
      if (a.title) {
        const norm = normalizeTitle(a.title);
        if (norm && memoryTitleSet.has(norm)) return false;
      }
      return true;
    });
  }

  return articles.filter((_, i) => {
    const linkEntry = results[i * 2] as { result?: number } | null;
    const titleEntry = results[i * 2 + 1] as { result?: number } | null;
    const linkExists = linkEntry && linkEntry.result !== 0;
    const titleExists = titleEntry && titleEntry.result !== 0;
    return !linkExists && !titleExists;
  });
}

/**
 * 配信済みとしてマークする。
 * titles を渡すとタイトルベースの重複防止も有効になる（Google News URL変動対策）。
 */
export async function markNotified(links: string[], titles?: string[]): Promise<void> {
  if (links.length === 0) return;

  // インメモリにも記録（同一インスタンス内の高速チェック用）
  for (const link of links) memorySet.add(link);
  if (titles) {
    for (const title of titles) {
      const norm = normalizeTitle(title);
      if (norm) memoryTitleSet.add(norm);
    }
  }

  // メモリ上限管理
  if (memorySet.size > MAX_IN_MEMORY) {
    const excess = memorySet.size - MAX_IN_MEMORY;
    const iter = memorySet.values();
    for (let i = 0; i < excess; i++) {
      memorySet.delete(iter.next().value as string);
    }
  }
  if (memoryTitleSet.size > MAX_IN_MEMORY) {
    const excess = memoryTitleSet.size - MAX_IN_MEMORY;
    const iter = memoryTitleSet.values();
    for (let i = 0; i < excess; i++) {
      memoryTitleSet.delete(iter.next().value as string);
    }
  }

  // Redis: SETEX で個別キー + 24h TTL（link + title 両方）
  if (kvConfig()) {
    const commands = links.map((link) => [
      'SETEX', `${KEY_PREFIX}${link}`, String(EXPIRE_SECONDS), '1',
    ]);
    if (titles) {
      for (const title of titles) {
        const norm = normalizeTitle(title);
        if (norm) {
          commands.push(['SETEX', `${TITLE_KEY_PREFIX}${norm}`, String(EXPIRE_SECONDS), '1']);
        }
      }
    }
    await redisPipeline(commands);
  }
}
