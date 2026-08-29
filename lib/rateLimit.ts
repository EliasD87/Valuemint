import "server-only";

/**
 * Rate limiting, behind an interface.
 *
 * The implementation here keeps counters in module memory, which is correct for
 * a single long-lived server and *weak* on serverless: each Vercel lambda gets
 * its own memory, so N concurrent instances means roughly N times the limit,
 * and a cold start forgets everything.
 *
 * That is deliberate and is why this is an interface rather than a few lines
 * inlined into the route. Swapping in Vercel KV or Upstash at deploy time means
 * writing one more `RateLimiter` and changing the export at the bottom -
 * nothing that calls `limiter.take()` has to change.
 *
 * The limits are a second line of defence. The primary gate on /api/pin is a
 * wallet signature plus an on-chain balance floor, which is what actually makes
 * bulk abuse cost money; see lib/uploadAuth.ts.
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
class MemoryRateLimiter implements RateLimiter {
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

export const limiter: RateLimiter = new MemoryRateLimiter();

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
