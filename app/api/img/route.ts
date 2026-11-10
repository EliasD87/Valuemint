import { NextResponse } from "next/server";
import { CYBEREATOR_IMAGE_HOST } from "@/lib/cybereator";

/**
 * An artist's image, served from our edge exactly as the artist published it.
 *
 * `GET /api/img?url=<image>` fetches the file once and hands back the same
 * bytes — no resizing, no re-encoding, no change of format — with a year-long
 * cache, so every later visitor gets it from Vercel near them instead of from
 * the artist's server. Unlike `/api/still`, which shrinks images for cards,
 * this one never touches the picture: it exists for profile-picture
 * collections whose owners want the original everywhere.
 *
 * Made for Cybereator's reveal (2026-11-10). Its art sits on Alibaba Cloud OSS
 * in Tokyo with no CDN in front: measured from Africa, a 383 KB image took
 * 2-10 s and twenty at once up to 29 s. Its team's integration notes say every
 * image is immutable at its address and may be cached long-term or fetched
 * through a server or CDN.
 *
 * **An image proxy, so narrow on purpose.** Only that one host, only https,
 * only image responses. Anything this route will not serve — another host, a
 * failure, a file too large — redirects to the original, so a picture is never
 * lost to it.
 */

export const runtime = "nodejs";

/** Their slowest measured fetch of a large file; a miss beyond it goes to the original. */
const TIMEOUT_MS = 25_000;

/**
 * Vercel will not send a function response over 4.5 MB. A revealed piece is
 * expected at 0.5-1 MB; anything near the limit goes straight to the source.
 */
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_HOSTS: readonly string[] = [CYBEREATOR_IMAGE_HOST];

/** The same immutability the source declares, at the edge as well as in the browser. */
const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

function allowed(raw: string): URL | undefined {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.port !== "") return undefined;
    if (!ALLOWED_HOSTS.includes(u.hostname)) return undefined;
    if (!/\.(png|webp|gif|jpe?g)$/i.test(u.pathname)) return undefined;
    return u;
  } catch {
    return undefined;
  }
}

/** To the original, briefly cached so a passing failure is retried soon. */
function toOriginal(url: string): NextResponse {
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const source = allowed(raw);
  if (source === undefined) {
    return NextResponse.json({ error: "Not an image this site serves." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(source, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error", cache: "no-store" });
  } catch {
    return toOriginal(source.href);
  }
  if (!upstream.ok) return toOriginal(source.href);

  const type = upstream.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return toOriginal(source.href);
  if (Number(upstream.headers.get("content-length") ?? "0") > MAX_BYTES) return toOriginal(source.href);

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return toOriginal(source.href);

  /*
    The source's own `Content-Disposition: attachment` is deliberately not
    passed on: it makes a browser download the picture instead of showing it
    when the address is opened directly.
  */
  return new NextResponse(bytes, {
    status: 200,
    headers: { "content-type": type, "cache-control": CACHE, "content-length": String(bytes.byteLength) },
  });
}
