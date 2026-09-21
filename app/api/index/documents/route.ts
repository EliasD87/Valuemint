import { NextResponse } from "next/server";
import { indexConfigured, select } from "@/lib/supabase";
import { documentAnswer, type DocStatus } from "@/lib/documentCache";
import { fetchAndStore } from "@/lib/documentStore";

/**
 * Token documents, many at a time, cached.
 *
 * `GET /api/index/documents?urls=<encoded>,<encoded>,…` → `{ documents: { url: raw } }`
 *
 * This is the piece that fixes the slowest thing on the site. Measured on the
 * live Cybereator page:
 *
 *     mainnet-gw.sodex.dev    69 requests    17,029 ms
 *
 * One request per token, from the browser, to a host that sends no cache
 * headers — so every cold visitor paid it again. Cybereator's contract points
 * `tokenURI` at SoDEX's gateway and always will; it is not IPFS and not this
 * project's metadata route, so none of the batching already built for those
 * applied to it.
 *
 * ---
 *
 * **Read-through, not a backfill.** A miss is fetched here and kept, so the
 * first visitor to a collection warms it for everyone after. There is nothing
 * to enumerate, no job to run, and a token minted a minute ago is simply a URL
 * nobody has asked for yet.
 *
 * **A URL missing from the response is not "no metadata".** It means this route
 * did not answer for it — out of budget, or not a host the server may call —
 * and the caller should fetch it the way it always did. `null` is the different
 * answer: asked, and there is genuinely nothing there.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A page asks for sixty. The cap is what bounds the work one request can buy. */
const MAX_URLS = 100;

/**
 * Stop fetching after this and answer with what landed.
 *
 * The caller can read the rest itself — that is what an absent URL means — so
 * a slow host costs a partial answer rather than a request that dies at the
 * platform's own limit and returns nothing at all.
 */
const BUDGET_MS = 20_000;

/**
 * How long a stored document is trusted.
 *
 * Documents are treated as immutable everywhere else in this app, and nearly
 * always are. But `setBaseURI` is `onlyOwner` with no freeze, and SoDEX can
 * change what their gateway returns at any time — so "forever" is not quite
 * true and a day is the honest version of it. A stale row is still served
 * immediately; it is only refreshed in the background.
 */
const FRESH_MS = 24 * 60 * 60 * 1000;

/** A failure is remembered too, but briefly — a host comes back. */
const FRESH_FAILED_MS = 60 * 60 * 1000;

interface Row {
  url: string;
  raw: unknown;
  status: "ok" | "missing" | "refused";
  fetched_at: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!indexConfigured()) {
    return NextResponse.json({ error: "index not configured" }, { status: 503 });
  }

  const raw = new URL(request.url).searchParams.get("urls") ?? "";

  /**
   * Parsed strictly and deduplicated. The treasure boxes put the tier in the
   * URL, so a page of 60 cards can genuinely be two documents — deduplicating
   * here is most of the saving on those collections.
   */
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const url = decodeURIComponent(part.trim());
    if (url === "" || seen.has(url) || urls.length >= MAX_URLS) continue;
    seen.add(url);
    urls.push(url);
  }

  if (urls.length === 0) return NextResponse.json({ documents: {} });

  try {
    const stored = await select<Row>(
      `documents?select=url,raw,status,fetched_at&url=in.(${encodeURIComponent(
        urls.map((u) => `"${u.replaceAll('"', '\\"')}"`).join(","),
      )})`,
    );

    const have = new Map(stored.map((r) => [r.url, r]));
    const now = Date.now();

    const isFresh = (r: Row): boolean => {
      const age = now - new Date(r.fetched_at).getTime();
      return age < (r.status === "ok" ? FRESH_MS : FRESH_FAILED_MS);
    };

    /**
     * Anything not held, plus anything held but past its age.
     *
     * A stale row is still answered with below — it is refreshed in the same
     * breath, but nobody waits for that. The only requests anyone waits on are
     * the ones with no answer at all.
     */
    const missing = urls.filter((u) => have.get(u) === undefined);
    const stale = urls.filter((u) => {
      const r = have.get(u);
      return r !== undefined && !isFresh(r);
    });

    const toFetch = [...missing, ...stale];

    if (toFetch.length > 0) {
      const at = new Date().toISOString();
      const fetched = await fetchAndStore(toFetch, now + BUDGET_MS);
      for (const r of fetched) have.set(r.url, { ...r, fetched_at: at });
    }

    /**
     * Only what was actually answered. A URL left out tells the caller to read
     * it the way it always did, which is the difference between "we ran out of
     * time" and "there is nothing there".
     */
    const documents: Record<string, unknown> = {};
    for (const url of urls) {
      const row = have.get(url);
      if (row === undefined) continue;

      /**
       * `refused` is left out, not sent as null — see `documentAnswer`, which
       * is where that rule lives and is tested. Answering `null` for a refusal
       * is what took the fallback away and blanked the cards.
       */
      const answer = documentAnswer({ status: row.status as DocStatus, raw: row.raw });
      if (answer.omit) continue;

      documents[url] = answer.value;
    }

    return NextResponse.json(
      { documents },
      {
        headers: {
          /**
           * Longer than the order book's fifteen seconds by a wide margin. A
           * name and a picture do not change on a schedule; the row behind this
           * carries its own day-long age check for the rare time they do.
           */
          "cache-control": "public, s-maxage=300, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    console.error("[index] documents failed", err);
    /** Empty rather than an error: every caller can read the documents itself. */
    return NextResponse.json({ documents: {} }, { status: 200 });
  }
}
