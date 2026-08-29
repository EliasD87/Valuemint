import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Rate limiting, behind an interface.
 *
 * Two implementations. Which one runs is decided by whether a Redis-compatible
 * REST endpoint is configured, because the difference between them is not a
 * detail:
 *
 *   - `MemoryRateLimiter` keeps counters in module memory. Correct for a single
 *     long-lived server and **broken on serverless**: every Vercel lambda has
 *     its own memory, so N concurrent instances allow roughly N times the
 *     limit. Measured against the live site, not assumed — 40 parallel requests
 *     returned 19 successes *after* the limit was already exhausted.
 *
 *   - `RedisRateLimiter` keeps the window in one shared place, so every
 *     instance counts against the same total. This is the one that actually
 *     enforces a limit.
 *
 * The limits remain a second line of defence. The primary gate on /api/pin is a
 * wallet signature plus an on-chain balance floor, which is what makes bulk
 * abuse cost money; see lib/uploadAuth.ts.
 */

export interface Decision {
  ok: boolean;
  /** Seconds until the caller may retry. Only meaningful when `ok` is false. */
  retryAfter: number;
  remaining: number;
}

export interface RateLimiter {
  /** Consume one unit against `key`. */
  take(key: string, limit: number, windowMs: number): Promise<Decision>;
}

interface Bucket {
  /** Timestamps of the hits still inside the window. */
  hits: number[];
  /** When this bucket can be dropped entirely. */
  expires: number;
}

/**
 * A sliding window, so a burst at the edge of a fixed window cannot double the
 * effective limit the way a naive per-hour counter allows.
 */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  async take(key: string, limit: number, windowMs: number): Promise<Decision> {
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(key) ?? { hits: [], expires: 0 };
    const cutoff = now - windowMs;
    const hits = bucket.hits.filter((t) => t > cutoff);

    if (hits.length >= limit) {
      const oldest = hits[0] ?? now;
      this.buckets.set(key, { hits, expires: now + windowMs });
      return {
        ok: false,
        retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
        remaining: 0,
      };
    }

    hits.push(now);
    this.buckets.set(key, { hits, expires: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - hits.length };
  }

  /**
   * Drop expired buckets. Without this the map grows for every key ever seen,
   * which on a public endpoint is an unbounded allocation an attacker controls.
   */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expires <= now) this.buckets.delete(key);
    }
  }
}

/**
 * The same sliding window, held in Redis so every instance shares it.
 *
 * ## Why this is a Lua script and not three REST calls
 *
 * Read-count-then-write is exactly the race the memory limiter loses. Two
 * requests arriving together both read "under the limit" and both write, and
 * the limit is exceeded by however many arrived in that gap — which on
 * serverless is the whole problem, just moved from lambda memory into the
 * network. Redis runs a script to completion without interleaving, so counting
 * and recording happen as one indivisible step.
 *
 * The window is a sorted set scored by timestamp: expired entries are dropped
 * by score, the remainder is the count, and a new entry is added only if there
 * is room. The member has to be unique per request or two hits in the same
 * millisecond would collapse into one, so it is passed in rather than generated
 * in Lua, which must stay deterministic.
 */
const SLIDING_WINDOW = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return { 0, tonumber(oldest[2]) or now }
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return { 1, count + 1 }
`;

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly token: string,
    /** Falls back to this when Redis cannot be reached. */
    private readonly fallback: RateLimiter = new MemoryRateLimiter(),
  ) {}

  async take(key: string, limit: number, windowMs: number): Promise<Decision> {
    const now = Date.now();
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          "EVAL",
          SLIDING_WINDOW,
          "1",
          `rl:${key}`,
          String(now),
          String(windowMs),
          String(limit),
          randomUUID(),
        ]),
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) throw new Error(`redis ${res.status}`);

      const body = (await res.json()) as { result?: [number, number]; error?: string };
      if (body.error !== undefined || body.result === undefined) {
        throw new Error(body.error ?? "no result");
      }

      const [allowed, second] = body.result;
      if (allowed === 1) {
        return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - second) };
      }
      return {
        ok: false,
        retryAfter: Math.max(1, Math.ceil((second + windowMs - now) / 1000)),
        remaining: 0,
      };
    } catch {
      /**
       * Degrade rather than fail the request.
       *
       * A limiter that 500s when its store is unreachable turns a Redis blip
       * into an outage of everything behind it. The in-memory window still
       * blunts a single instance, and the endpoints this guards are not
       * defended by the limiter alone — /api/pin needs a wallet signature and
       * an on-chain balance, and the Trenches authoriser re-reads SoDEX and
       * signs only for a wallet that qualifies.
       */
      return this.fallback.take(key, limit, windowMs);
    }
  }
}

/**
 * Vercel KV and Upstash expose the same REST shape under different names, and
 * a project set up either way should work without editing this file.
 */
function configured(): { url: string; token: string } | undefined {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  return url !== "" && token !== "" ? { url, token } : undefined;
}

const kv = configured();

/**
 * Shared when a store is configured, per-instance otherwise.
 *
 * Deliberately not an error when unset: local development and preview builds
 * have no KV, and refusing to start would be worse than a limiter that only
 * counts one instance. `limiterIsShared` lets a health check report which one
 * is live, so "the limit is not being enforced" is observable rather than
 * silent.
 */
export const limiter: RateLimiter =
  kv === undefined ? new MemoryRateLimiter() : new RedisRateLimiter(kv.url, kv.token);

/** Whether the limit is enforced across instances. False means per-instance only. */
export const limiterIsShared = kv !== undefined;

/**
 * Best guess at the caller's address.
 *
 * Behind a proxy that does not set these, or in front of one that lets a client
 * set them, this is spoofable - which is exactly why IP is the *secondary*
 * limit here and never the only gate. `x-vercel-forwarded-for` is set by the
 * platform and cannot be forged by the client; the others are conventions.
 */
export function callerKey(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel !== null && vercel !== "") return vercel.split(",")[0]!.trim();

  const real = request.headers.get("x-real-ip");
  if (real !== null && real !== "") return real.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded !== "") return forwarded.split(",")[0]!.trim();

  return "unknown";
}
