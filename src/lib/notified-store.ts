/**
 * 配信済みニュース記事リンクの永続ストア。
 *
 * - KV_REST_API_URL + KV_REST_API_TOKEN が設定されていれば Upstash Redis で永続化
 * - 未設定時はインメモリ Set にフォールバック（コールドスタートでリセット）
 *
 * Redis 側は SADD + EXPIRE(24h) で自動クリーンアップ。
 */

const KV_KEY = 'notified_news_links';
const MAX_IN_MEMORY = 500;
const EXPIRE_SECONDS = 86400; // 24h

// --------------- in-memory fallback ---------------
const memorySet = new Set<string>();

// --------------- Upstash Redis REST ---------------

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function redisCommand<T = unknown>(...args: string[]): Promise<T | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      console.error(`[notified-store] Redis ${args[0]} failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.result as T;
  } catch (err) {
    console.error('[notified-store] Redis error:', err);
    return null;
  }
}

// Redis から既存リンクをメモリにロード（初回のみ）
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  if (!kvConfig()) return;
  const members = await redisCommand<string[]>('SMEMBERS', KV_KEY);
  if (members && Array.isArray(members)) {
    for (const m of members) memorySet.add(m);
  }
}

// --------------- Public API ---------------

/**
 * 未配信の記事だけを返す。
 */
export async function filterUnnotified<T extends { link: string }>(articles: T[]): Promise<T[]> {
  await ensureLoaded();
  return articles.filter((a) => !memorySet.has(a.link));
}

/**
 * 配信済みとしてマークする。
 */
export async function markNotified(links: string[]): Promise<void> {
  for (const link of links) memorySet.add(link);

  // メモリ上限を超えたら古いものから削除
  if (memorySet.size > MAX_IN_MEMORY) {
    const excess = memorySet.size - MAX_IN_MEMORY;
    const iter = memorySet.values();
    for (let i = 0; i < excess; i++) {
      memorySet.delete(iter.next().value as string);
    }
  }

  // Redis に永続化
  if (kvConfig() && links.length > 0) {
    await redisCommand('SADD', KV_KEY, ...links);
    await redisCommand('EXPIRE', KV_KEY, String(EXPIRE_SECONDS));
  }
}
