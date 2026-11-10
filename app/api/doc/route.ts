import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { proxyableDoc } from "@/lib/docProxy";
import { CYBEREATOR_IMAGE_HOST, cybereatorStatus, isCybereatorDoc } from "@/lib/cybereator";
import { enrichCybereatorDoc, type CybereatorCatalog } from "@/lib/cybereatorRarity";

/**
 * One token document from a listed third-party host, cached at the edge
 * (2026-10-25). See lib/docProxy.ts for why it exists and which hosts.
 *
 * The upstream's answer is passed through as it came, status included:
 * SoDEX answers 501 with a JSON body by design for the boxes, and the browser
 * already knows what to do with that. Only failures of the trip itself (a
 * timeout, a dropped connection, an answer that is not JSON) become 502, and
 * those are never cached.
 */

export const runtime = "nodejs";

/** Long enough for SoDEX's slowest measured answer (1.5 s) several times over. */
const TIMEOUT_MS = 8_000;

/** A token document is a few kilobytes. Anything this size is not one. */
const MAX_BYTES = 256 * 1024;

/**
 * A day at the edge and an hour in the browser, then a week of serving the
 * old copy while a fresh one is fetched. A document at a URL rarely changes,
 * but our own Trenches tiers were re-imaged once, so not forever.
 */
const CACHE_OK = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
/**
 * Cybereator's documents, which change in place (2026-11-09).
 *
 * The cache above assumes a reveal points a token at a new URL. Cybereator's
 * does not: `…/nft/token/cybr/3032` stays put and its answer changes when the
 * holder breaks the seal (from 10 November, 12:00 UTC, each holder revealing
 * their own). A day at the edge would have shown a revealed piece sealed for
 * a day, so these are kept two minutes and refreshed in the background.
 */
const CACHE_CHANGING = "public, max-age=120, s-maxage=120, stale-while-revalidate=600";

/** Documents that can change at the same URL: SoDEX's per-token Cybereator ones. */
function changesInPlace(url: string): boolean {
  return /^https:\/\/mainnet-gw\.sodex\.dev\/api\/v1\/nft\/token\/cybr\//.test(url);
}

/**
 * cybereator.com's documents, cached by what they say (their integration
 * notes, 2026-11-10). While a document carries a `Status` trait (Unopened,
 * Opening, Rendering) it is about to change, so it is held for seconds: enough
 * to absorb a burst of visitors, never enough to hide a reveal. Once `Status`
 * is gone the piece is final and its team guarantees it never changes, so it
 * is held for a month at the edge and a day in the browser.
 */
const CACHE_PENDING = "public, max-age=0, s-maxage=10";
const CACHE_FINAL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";

/** "No document here" (404, SoDEX's 501) for an hour: it can start existing. */
const CACHE_MISSING = "public, max-age=300, s-maxage=3600";

export async function GET(request: Request): Promise<NextResponse> {
  const target = new URL(request.url).searchParams.get("url");
  if (target === null || !proxyableDoc(target)) {
    return NextResponse.json({ error: "not a document this site fetches" }, { status: 400 });
  }

  /*
    A revealed Cybereator, from the server cache that outlives deploys
    (2026-11-10). The edge cache above is emptied by every deploy, and after
    one each piece cost a ~1 s trip to cybereator.com again: 350 of them on the
    collection page, measured. A final document never changes (the team's
    rule), so it is kept here for good once read. A piece still pending is not
    kept, and is answered from the fetch already made.
  */
  if (isCybereatorDoc(target)) {
    try {
      const body = await finalCybereatorDoc(target);
      return NextResponse.json(body, { status: 200, headers: { "cache-control": CACHE_FINAL } });
    } catch (err) {
      if (err instanceof NotFinal) {
        return NextResponse.json(err.body, {
          status: err.status,
          headers: { "cache-control": err.status >= 200 && err.status < 300 ? CACHE_PENDING : err.status === 404 ? CACHE_MISSING : "no-store" },
        });
      }
      /* The trip itself failed; fall through and try once more the ordinary way. */
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      /* A redirect could lead anywhere; the allow-list is only worth something if it is the last word. */
      redirect: "error",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "upstream unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  const length = Number(upstream.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  const text = await upstream.text();
  if (text.length > MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "not json" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  const status = upstream.status;

  /*
    A revealed Cybereator gets its rarity added here, once, from its team's
    catalog (lib/cybereatorRarity.ts). If the catalog cannot be read just now
    the document goes out without it and is cached for seconds, not a month,
    so the next visitor's request tries again.
  */
  let enriched = true;
  if (upstream.ok && isCybereatorDoc(target) && cybereatorStatus(body) === undefined) {
    const withRarity = await addRarity(body);
    if (withRarity === undefined) enriched = false;
    else body = withRarity;
  }

  const cache = upstream.ok
    ? isCybereatorDoc(target)
      ? cybereatorStatus(body) === undefined && enriched
        ? CACHE_FINAL
        : CACHE_PENDING
      : changesInPlace(target)
        ? CACHE_CHANGING
        : CACHE_OK
    : status === 404 || status === 501
      ? CACHE_MISSING
      : "no-store";
  return NextResponse.json(body, { status, headers: { "cache-control": cache } });
}

/** A Cybereator document that is not (yet) final, carried out of the cache so it is not fetched twice. */
class NotFinal extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super("not final");
  }
}

/**
 * A revealed Cybereator document with its rarity, cached for good across
 * deploys. Throws `NotFinal` for anything else, which `unstable_cache` never
 * stores. Bump the key's version if the rarity added here ever changes.
 */
const finalCybereatorDoc = unstable_cache(
  async (url: string): Promise<unknown> => {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const text = await upstream.text();
    if (text.length > MAX_BYTES) throw new Error("too large");
    const body: unknown = JSON.parse(text);
    if (!upstream.ok || cybereatorStatus(body) !== undefined) throw new NotFinal(upstream.status, body);
    const withRarity = await addRarity(body);
    /* Final, but the catalog did not answer: serve it unenriched, briefly, and try again next time. */
    if (withRarity === undefined) throw new NotFinal(upstream.status, body);
    return withRarity;
  },
  ["cybereator-final-doc-v1"],
  { revalidate: false, tags: ["cybereator-doc"] },
);

/** Each catalog version, read once per server instance; it never changes (its path carries the version). */
const catalogs = new Map<string, Promise<CybereatorCatalog | undefined>>();

function catalogFor(version: string): Promise<CybereatorCatalog | undefined> {
  let pending = catalogs.get(version);
  if (pending === undefined) {
    pending = fetch(`https://${CYBEREATOR_IMAGE_HOST}/catalog/${version}/catalog.json`, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    })
      .then(async (res) => (res.ok ? ((await res.json()) as CybereatorCatalog) : undefined))
      .catch(() => undefined);
    pending.then((c) => {
      if (c === undefined) catalogs.delete(version);
    });
    catalogs.set(version, pending);
  }
  return pending;
}

async function addRarity(body: unknown): Promise<unknown | undefined> {
  const version = (body as { rules_version?: unknown } | null)?.rules_version;
  if (typeof version !== "string" || !/^[0-9a-f]{6,64}$/i.test(version)) return undefined;
  const catalog = await catalogFor(version);
  if (catalog === undefined) return undefined;
  return enrichCybereatorDoc(body as { attributes?: unknown }, catalog);
}
