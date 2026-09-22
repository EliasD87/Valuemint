import { NextResponse } from "next/server";
import { indexConfigured, select } from "@/lib/supabase";

/**
 * What a collection's floor has been, hour by hour.
 *
 * `GET /api/index/floors?collection=0x…&days=30` → the hourly buckets the sync
 * has recorded, oldest first.
 *
 * ---
 *
 * **This is the one route serving something the chain cannot answer.**
 *
 * Every other index route is a cache: delete it and the client reads the same
 * facts from Seaport, slower. Not this one. A floor is the minimum over the
 * orders that were live AT A MOMENT, and "live" depends on fills,
 * cancellations, expiries and counter increments — the last of which leaves no
 * per-order trace. Yesterday's floor is not recoverable from today's logs, so
 * if these rows are missing the answer is genuinely unknown and the chart says
 * so rather than falling back.
 *
 * That also means it has no chain to be checked against, which makes it the
 * most trusted thing here. Three things bound that: the rows are written only
 * by this project's own sync route, from `collection_floors`, which is itself
 * derived from validated on-chain orders; nothing anybody acts on comes from
 * here (a price somebody buys at comes from the order book, which Seaport
 * re-checks); and the series is a picture rather than a quote.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How far back one response may reach.
 *
 * 90 days of hourly buckets is 2,160 rows for one collection, comfortably
 * inside PostgREST's 1,000-row page — so this is deliberately capped BELOW that
 * cap rather than relying on it. A silent truncation at exactly 1,000 would
 * draw a chart that simply began 41 days ago with no indication why.
 */
const MAX_DAYS = 90;
const MAX_ROWS = 900;

/** Lower-cased, and refused outright if it is not an address. */
function address(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const value = raw.trim().toLowerCase();
  /**
   * Validated rather than escaped. This goes into a PostgREST filter and the
   * one thing that must not happen is a caller writing their own query.
   */
  return /^0x[0-9a-f]{40}$/.test(value) ? value : undefined;
}

interface Row {
  bucket: string;
  floor_wei: string | null;
  listed: number;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!indexConfigured()) {
    /**
     * 503 rather than an empty list. A floor series cannot be derived from the
     * chain, so "no index" and "no history" must not look alike: the first
     * means the chart should say it is unavailable, the second that this
     * collection has never had a listing.
     */
    return NextResponse.json({ error: "index not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const collection = address(url.searchParams.get("collection"));
  if (collection === undefined) {
    return NextResponse.json({ error: "collection required" }, { status: 400 });
  }

  const requested = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_DAYS)
    : 30;

  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const rows = await select<Row>(
      `floor_history_public?select=bucket,floor_wei,listed` +
        `&collection=eq.${collection}` +
        `&bucket=gte.${since}` +
        `&order=bucket.asc` +
        `&limit=${MAX_ROWS}`,
    );

    return NextResponse.json(
      {
        /** Oldest first, which is the order a line is drawn in. */
        points: rows.map((r) => ({
          at: r.bucket,
          /**
           * Text, never a number. 1 SOSO is 1e18 wei and a JSON number loses
           * precision above 2^53 — the same reason every other view here casts
           * to text.
           */
          floorWei: r.floor_wei,
          listed: r.listed,
        })),
        days,
      },
      {
        headers: {
          /**
           * Five minutes. The series only gains a point an hour, so anything
           * shorter re-reads Supabase for an answer that cannot have changed.
           */
          "cache-control": "public, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  } catch (err) {
    console.error("[index] floors failed", err);
    return NextResponse.json({ error: "index unavailable" }, { status: 502 });
  }
}
