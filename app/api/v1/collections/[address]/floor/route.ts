import { NextResponse } from "next/server";
import { formatEther, getAddress, isAddress } from "viem";
import { callerKey, limiter } from "@/lib/rateLimit";
import { indexConfigured, select } from "@/lib/supabase";
import { floorFor } from "@/lib/collectionFigures";
import { floorChange } from "@/lib/floorChange";
import { readNames } from "@/lib/exploreSummary";
import { siteUrl } from "@/lib/site";

/**
 * A collection's floor price, for anyone to read.
 *
 * `GET /api/v1/collections/{address}/floor` →
 *
 *     {
 *       "collection": "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
 *       "name": "Cybereator",
 *       "currency": "SOSO",
 *       "floor": "250",
 *       "floorWei": "250000000000000000000",
 *       "listed": 18,
 *       "change24h": 112.0,
 *       "updatedAt": "2026-11-03T05:00:00.000Z",
 *       "url": "https://www.valuemint.store/collection/0xCD30…"
 *     }
 *
 * The first public route (2026-11-03): versioned, readable from any site, and
 * promised not to change shape. The `/api/index/*` routes stay private — they
 * hand back raw Seaport orders, stale ones included, and change with the app.
 *
 * **The floor is the one the collection page shows**, from `floorFor`: a
 * listing counts only if Seaport still reports it open, it has not expired,
 * and the seller still owns the piece and has approved the sale. The index's
 * own floor view checks none of the last three, so it is not exposed.
 *
 * `floor` is null when nothing can be bought; `change24h` is null when there
 * is no floor now or no record from 24 hours ago, and is a percentage
 * (112.0 means +112%). Prices are per piece, in SOSO, as decimal strings so
 * no reader loses precision to a float.
 *
 * Cached at the edge for a minute and served stale for five while it
 * refreshes, so most reads never reach the chain. Callers that bypass the
 * cache are rate-limited per address.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uncached reads one caller may make an hour. A cache hit costs nothing and is not counted. */
const PER_CALLER_PER_HOUR = 120;
const HOUR_MS = 3_600_000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
} as const;

function fail(error: string, status: number, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error }, { status, headers: { ...CORS, "cache-control": "no-store", ...extra } });
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const { address: raw } = await params;
  if (!isAddress(raw, { strict: false })) return fail("Not a collection address.", 400);
  if (!indexConfigured()) return fail("Prices are unavailable right now.", 503);

  const gate = await limiter.take(`v1-floor:${callerKey(request)}`, PER_CALLER_PER_HOUR, HOUR_MS);
  if (!gate.ok) return fail("Too many requests. Try again shortly.", 429, { "retry-after": String(gate.retryAfter) });

  const collection = getAddress(raw);
  const lower = collection.toLowerCase();
  const since = new Date(Date.now() - 30 * HOUR_MS).toISOString();

  try {
    const [floor, history, names] = await Promise.all([
      floorFor(lower),
      select<{ bucket: string; floor_wei: string | null }>(
        `floor_history_public?select=bucket,floor_wei&collection=eq.${lower}&bucket=gte.${since}&order=bucket.asc`,
      ),
      readNames([lower]).catch(() => new Map<string, { name?: string }>()),
    ]);
    if (floor === undefined) return fail("Prices are unavailable right now.", 503);

    const floorWei = floor.floorWei === undefined ? undefined : BigInt(floor.floorWei);
    const change = floorChange(
      history.map((h) => ({
        at: new Date(h.bucket),
        ...(h.floor_wei === null ? {} : { floorWei: BigInt(h.floor_wei) }),
      })),
      floorWei,
    );

    return NextResponse.json(
      {
        collection,
        name: names.get(lower)?.name ?? null,
        currency: "SOSO",
        floor: floorWei === undefined ? null : formatEther(floorWei),
        floorWei: floorWei === undefined ? null : floorWei.toString(),
        listed: floor.listed ?? 0,
        change24h: change.kind === "change" ? Math.round(change.percent * 100) / 100 : null,
        updatedAt: new Date().toISOString(),
        url: `${siteUrl()}/collection/${collection}`,
      },
      {
        headers: {
          ...CORS,
          "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("[v1] floor failed", err);
    return fail("Prices are unavailable right now.", 502);
  }
}
