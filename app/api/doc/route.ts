import { NextResponse } from "next/server";
import { proxyableDoc } from "@/lib/docProxy";

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
/** "No document here" (404, SoDEX's 501) for an hour: it can start existing. */
const CACHE_MISSING = "public, max-age=300, s-maxage=3600";

export async function GET(request: Request): Promise<NextResponse> {
  const target = new URL(request.url).searchParams.get("url");
  if (target === null || !proxyableDoc(target)) {
    return NextResponse.json({ error: "not a document this site fetches" }, { status: 400 });
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
  const cache = upstream.ok ? CACHE_OK : status === 404 || status === 501 ? CACHE_MISSING : "no-store";
  return NextResponse.json(body, { status, headers: { "cache-control": cache } });
}
