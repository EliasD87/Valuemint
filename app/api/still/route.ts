import { NextResponse } from "next/server";
import sharp from "sharp";
import { metadataFetchAllowed } from "@/lib/media";

/**
 * A small, still thumbnail of collection artwork.
 *
 * Next's image optimiser refuses to touch an animated image and passes the
 * original through instead — sensible in general, ruinous here. Cybereator's
 * artwork is a **6.58 MB animated GIF**, both Cybereator contracts point every
 * one of their 2,968 tokens at that same one file, and Vercel serves it with
 * `Cache-Control: max-age=60`. Measured on the live site:
 *
 *     /_next/image?url=<that gif>   200   6,577,743 bytes   image/gif   max-age=60
 *
 * So a visitor who sees a Cybereator card downloads 6.58 MB, and downloads it
 * again a minute later. At the traffic this launch expects that is hundreds of
 * gigabytes for one picture.
 *
 * A card is 260px and never animates anything. `sharp` takes one frame, resizes
 * it to the slot and re-encodes to WebP. Measured against that same GIF:
 *
 *     6,577,743 bytes  ->  8,976 bytes at w=256     (733x smaller)
 *
 * and it is `immutable` for a year instead of sixty seconds, so a returning
 * visitor pays nothing at all rather than 6.58 MB again.
 *
 * ---
 *
 * **This is an image proxy, which is a thing to be careful with.** Two rules:
 *
 *   - the source must pass `metadataFetchAllowed` — https, and one of the
 *     handful of gateway hosts. Collection metadata can name any URL, so
 *     without that this route would fetch whatever a stranger's contract
 *     pointed it at, including addresses only the server can reach.
 *   - the width must be one of a fixed set. An open width parameter is a cache
 *     key anyone can vary, which turns a CDN into a way to spend the
 *     account's CPU on the same image ten thousand times.
 *
 * A failure redirects to the original rather than erroring, so a picture this
 * route cannot process still appears — just heavier.
 */

/**
 * `sharp` is a native module, so this cannot run on the Edge runtime.
 *
 * Route handlers already default to Node, but saying so means a future change
 * to that default cannot silently break the one route whose whole job is
 * decoding an image.
 */
export const runtime = "nodejs";

/**
 * Long enough to fetch a large original and decode it.
 *
 * The platform default is 10s and the work here can legitimately exceed it:
 * Cybereator's GIF is 6.58 MB and takes ~10s from the gateway before sharp has
 * touched it. Killed at 10s, this route would time out on exactly the image it
 * exists to handle, and the fallback would serve the 6.58 MB original instead —
 * the failure being silent, and only on the heaviest file.
 *
 * It costs nothing when unused: a small image still answers in ~2s.
 */
export const maxDuration = 60;

/** The slots a card actually uses, at 1x and 2x. Nothing else is honoured. */
const WIDTHS = new Set([128, 192, 256, 384, 512, 640]);

/** Enough for any real artwork; a refusal to read past it is the point. */
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;

/** Content-addressed artwork never changes, so this can be cached hard. */
const CACHE = {
  "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
  "Access-Control-Allow-Origin": "*",
} as const;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const src = params.get("url") ?? "";
  /**
   * `size`, not `w`.
   *
   * `w` is `next/image`'s own query parameter, and it strips it out of a src it
   * is given - the rendered URL came out as `/api/still?url=…&` with the width
   * silently gone. The route then fell back to its default and looked fine,
   * which is the worst kind of working: every slot would have quietly received
   * the same 256px image regardless of what it asked for.
   */
  const width = Number(params.get("size") ?? "256");

  if (!metadataFetchAllowed(src)) {
    return NextResponse.json({ error: "That host is not allowed." }, { status: 400 });
  }
  if (!WIDTHS.has(width)) {
    return NextResponse.json({ error: "Unsupported width." }, { status: 400 });
  }

  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return NextResponse.redirect(src, 302);

    /**
     * Refuse before decoding, not after.
     *
     * `Content-Length` is a hint and can lie, so the buffer is checked again
     * below — but when it is present and absurd, there is no reason to spend
     * the bandwidth finding out.
     */
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
      return NextResponse.redirect(src, 302);
    }

    const source = Buffer.from(await res.arrayBuffer());
    if (source.byteLength > MAX_SOURCE_BYTES) return NextResponse.redirect(src, 302);

    /**
     * The middle frame, not the first.
     *
     * Taking frame 0 is the obvious thing and it was wrong here: Cybereator's
     * animation opens *and* closes on a plain yellow title card, so both ends
     * are a logo and every thumbnail came out as the same yellow rectangle.
     * Frame 62 of 125 is the character. An animation that starts on a title,
     * a fade or a black frame is common enough that the middle is the better
     * guess in general, and it costs one metadata read.
     */
    const meta = await sharp(source, { animated: true }).metadata();
    const pages = meta.pages ?? 1;
    const page = pages > 1 ? Math.floor(pages / 2) : 0;

    /**
     * `pages: 1` is what makes this a still — without it sharp keeps the whole
     * animation and the output is as heavy as the input. `withoutEnlargement`
     * so a small original is not blown up into a bigger file than it started as.
     */
    const still = await sharp(source, { page, pages: 1 })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    return new NextResponse(new Uint8Array(still), {
      headers: { ...CACHE, "Content-Type": "image/webp" },
    });
  } catch {
    /**
     * Anything sharp cannot read — an SVG, a format it was not built with, a
     * truncated file — still has to appear. The original is served by the
     * browser instead, which is exactly today's behaviour.
     */
    return NextResponse.redirect(src, 302);
  }
}
