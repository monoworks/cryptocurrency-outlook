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
const MAX_IN_MEMORY = 500;
const EXPIRE_SECONDS = 86400; // 24h

// --------------- in-memory fallback ---------------
const memorySet = new Set<string>();

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
 */
export async function filterUnnotified<T extends { link: string }>(articles: T[]): Promise<T[]> {
  if (articles.length === 0) return [];

  const cfg = kvConfig();
  if (!cfg) {
    // インメモリフォールバック
    return articles.filter((a) => !memorySet.has(a.link));
  }

  // Redis: EXISTS を pipeline で一括チェック
  const commands = articles.map((a) => ['EXISTS', `${KEY_PREFIX}${a.link}`]);
  const results = await redisPipeline(commands);

  if (!results) {
    // Redis 障害時はインメモリにフォールバック
    return articles.filter((a) => !memorySet.has(a.link));
  }

  return articles.filter((_, i) => {
    const entry = results[i] as { result?: number } | null;
    return !entry || entry.result === 0;
  });
}

/**
 * 配信済みとしてマークする。
 */
export async function markNotified(links: string[]): Promise<void> {
  if (links.length === 0) return;

  // インメモリにも記録（同一インスタンス内の高速チェック用）
  for (const link of links) memorySet.add(link);
  if (memorySet.size > MAX_IN_MEMORY) {
    const excess = memorySet.size - MAX_IN_MEMORY;
    const iter = memorySet.values();
    for (let i = 0; i < excess; i++) {
      memorySet.delete(iter.next().value as string);
    }
  }

  // Redis: SETEX で個別キー + 24h TTL
  if (kvConfig()) {
    const commands = links.map((link) => [
      'SETEX', `${KEY_PREFIX}${link}`, String(EXPIRE_SECONDS), '1',
    ]);
    await redisPipeline(commands);
  }
}
