import { NextResponse } from "next/server";
import { CACHE_HEADERS, tokenDocument, willFetch } from "@/lib/tokenDocument";
import { callerKey, limiter } from "@/lib/rateLimit";

/**
 * Token metadata, generated rather than stored.
 *
 * A pinning account's *file count* runs out long before its storage does, and
 * storing one document per token made a collection cost files in proportion to
 * its supply — so the larger the collection, the sooner creating one failed.
 *
 * Now a collection pins a single manifest describing its designs and shuffle
 * seed, and each token's document is recomputed here on request. One file per
 * collection, whatever the supply.
 *
 * `[collection]` accepts either:
 *   - a manifest CID, which is what /api/pin returns and what new collections'
 *     `baseURI` points at; or
 *   - a slug baked into this app, for collections built before the manifest
 *     existed.
 *
 * The response must be a bare JSON document at `baseURI + tokenId`, because
 * that is exactly what the contract concatenates. No `.json` suffix.
 *
 * **This route's output is load-bearing forever.** A contract's `baseURI` is
 * immutable, so wallets, explorers and other marketplaces will ask this exact
 * URL for as long as the collection exists. That is why the logic now lives in
 * `lib/tokenDocument.ts` and is *shared* with the batch route beside it rather
 * than copied into it: two copies of this would eventually disagree, and the
 * one that disagreed would be serving somebody's token the wrong picture.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string; id: string }> },
) {
  const { collection, id } = await params;

  /**
   * Rate limited on cache misses only.
   *
   * A hit is a map lookup and costs nothing, so wallets and marketplaces
   * crawling a collection they already warmed are never throttled. A miss
   * fetches from up to three gateways with a 12-second timeout each, and this
   * route is public and unauthenticated - so without a limit it is an
   * amplification vector: cheap requests in, expensive outbound fetches out.
   *
   * `willFetch` is the one place that decides this, and it has to consider both
   * the manifest cache AND the collections answered from memory. It was
   * `!cache.has(collection)` alone, and `cache` is keyed by manifest CID — a
   * slug like `trade-buddies` is never in it, so the answer was always "yes,
   * this will fetch". Every request for a baked-in collection therefore spent a
   * token from a budget of 120 an hour, and once an hour's worth had gone,
   * every further request got a 429. Measured in production before the fix:
   * `/api/metadata/trade-buddies/1` returned `{"error":"Too many requests."}`
   * on every attempt, twenty seconds apart, while a CID-addressed collection on
   * the same deploy returned 200. Trade Buddies' artwork simply did not load,
   * for anyone.
   */
  if (willFetch(collection)) {
    const gate = await limiter.take(`meta:${callerKey(request)}`, MISSES_PER_HOUR, HOUR);
    if (!gate.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
      );
    }
  }

  // Token ids start at 1, and must be a plain integer — "01", "1.0" and "1e3"
  // would otherwise index the assignment in surprising ways.
  if (!/^[0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Token id must be a whole number." }, { status: 400 });
  }

  const result = await tokenDocument(collection, Number(id));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.document, { headers: CACHE_HEADERS });
}

const HOUR = 60 * 60 * 1000;

/**
 * Generous, because a legitimate crawler warming several collections in one
 * pass is normal traffic and each of those is one miss. It bounds the abusive
 * case rather than shaping the honest one.
 */
const MISSES_PER_HOUR = 120;
