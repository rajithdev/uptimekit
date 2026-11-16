import "server-only";
import { Redis } from "ioredis";
import { env } from "./env";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitRule {
  /** Bucket name, e.g. "api" or "monitor-create". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  api: { name: "api", limit: 240, windowSeconds: 60 },
  apiWrite: { name: "api-write", limit: 60, windowSeconds: 60 },
  monitorCreate: { name: "monitor-create", limit: 10, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

const globalForRl = globalThis as unknown as { __uptimekitRedis?: Redis | null; __uptimekitMemRl?: Map<string, { count: number; expiresAt: number }> };

function redis(): Redis | null {
  if (globalForRl.__uptimekitRedis !== undefined) return globalForRl.__uptimekitRedis;
  const url = env().REDIS_URL;
  globalForRl.__uptimekitRedis = url
    ? new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
    : null;
  globalForRl.__uptimekitRedis?.on("error", () => {
    /* surfaced via fallback below; avoid unhandled error events */
  });
  return globalForRl.__uptimekitRedis;
}

function memoryStore() {
  globalForRl.__uptimekitMemRl ??= new Map();
  return globalForRl.__uptimekitMemRl;
}

/**
 * Fixed-window rate limiter. Uses Redis (shared across web replicas) when REDIS_URL is set,
 * and falls back to a per-process in-memory window if Redis is unavailable so a Redis outage
 * degrades limits rather than taking the API down.
 */
export async function rateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / 1000 / rule.windowSeconds);
  const key = `uptimekit:rl:${rule.name}:${subject}:${windowStart}`;
  const resetSeconds = rule.windowSeconds - (Math.floor(Date.now() / 1000) % rule.windowSeconds);

  let count: number | null = null;
  const client = redis();
  if (client && client.status === "ready") {
    try {
      const res = await client.multi().incr(key).expire(key, rule.windowSeconds + 1).exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } catch {
      count = null;
    }
  }
  if (count === null) {
    const store = memoryStore();
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.expiresAt < now) {
      store.set(key, { count: 1, expiresAt: now + rule.windowSeconds * 1000 });
      count = 1;
    } else {
      entry.count += 1;
      count = entry.count;
    }
    if (store.size > 10_000) {
      for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
    }
  }
  return { allowed: count <= rule.limit, limit: rule.limit, remaining: Math.max(0, rule.limit - count), resetSeconds };
}

export async function pingRedis(): Promise<boolean | null> {
  const client = redis();
  if (!client) return null;
  // On a cold process the client may still be connecting (offline queue is disabled).
  if (client.status !== "ready") {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 1500);
      client.once("ready", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  try {
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}
