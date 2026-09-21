import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { indexConfigured } from "@/lib/supabase";
import { fetchAndStore } from "@/lib/documentStore";
import { collectionUrls, unknownUrls, warmTargets } from "@/lib/warmDocuments";

/**
 * Cache every document the curated collections point at, before anyone asks.
 *
 * `POST /api/index/warm` with the shared secret.
 *
 * The read-through cache on its own was not the win it appeared to be.
 * Measured on the live site against 69 Cybereator documents:
 *
 *     straight to SoDEX, from the browser      69 requests    842 ms
 *     through the cache, cold                   1 request   1,850 ms
 *     through the cache, warm                   1 request     589 ms
 *
 * A first visitor paid more than they used to, and on a collection page that
 * scrolls into ids nobody has loaded yet, most visits are first visits. A cache
 * that is only fast once it has been used is not much of a cache for the pages
 * that matter here.
 *
 * This makes "cold" a thing that happens on a schedule with nobody waiting,
 * after which every page is the 589 ms row — and stays there, because the
 * warmer runs again for whatever has been minted since.
 *
 * Nothing waits on it. Every page can still read a document itself, so a run
 * that fails or never happens costs speed and nothing else.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stop fetching after this and report what landed.
 *
 * A collection is any size and a run has to end. Progress lives in the cache
 * itself — a URL already stored is skipped — so the next run resumes without a
 * cursor to keep in step with anything.
 */
const BUDGET_MS = 40_000;

/** Constant time: a plain `===` on a secret leaks it a byte at a time. */
function secretMatches(given: string | null): boolean {
  const expected = process.env.INDEX_SYNC_SECRET ?? "";
  if (expected === "" || given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const given = request.headers.get("x-index-secret") ?? url.searchParams.get("secret");

  if (!secretMatches(given)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  if (!indexConfigured()) {
    return NextResponse.json({ error: "index not configured" }, { status: 503 });
  }

  const started = Date.now();
  const deadline = started + BUDGET_MS;

  /** One collection per call when named, so a big one can be driven on its own. */
  const only = url.searchParams.get("collection")?.toLowerCase();
  const targets = warmTargets().filter(
    (t) => only === undefined || t.address.toLowerCase() === only,
  );

  const report: Array<{
    name: string;
    supply: number;
    urls: number;
    fetched: number;
    ok: number;
    ms: number;
  }> = [];

  try {
    for (const target of targets) {
      if (Date.now() > deadline) break;
      const at = Date.now();

      /**
       * Distinct URLs, not tokens. The difference is the whole job: the
       * Treasure Box puts its tier in the URL, so thousands of tokens are four
       * documents, while Cybereator gives every token its own.
       */
      const { urls, supply } = await collectionUrls(target.address);
      const todo = await unknownUrls(urls);
      const rows = await fetchAndStore(todo, deadline);

      report.push({
        name: target.name,
        supply,
        urls: urls.length,
        fetched: rows.length,
        ok: rows.filter((r) => r.status === "ok").length,
        ms: Date.now() - at,
      });
    }
  } catch (err) {
    console.error("[index] warm failed", err);
    return NextResponse.json(
      {
        error: "warm failed",
        message: err instanceof Error ? err.message : "unknown",
        report,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    collections: report,
    /** Nothing left to fetch anywhere: the cheap steady state. */
    settled: report.every((r) => r.fetched === 0),
    ms: Date.now() - started,
  });
}
