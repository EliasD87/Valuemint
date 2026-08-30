import "server-only";
import sharp, { type Metadata, type Sharp } from "sharp";

/**
 * Shrinks creator artwork before it is pinned.
 *
 * Uploads used to be stored exactly as received. The route caps a file at 8MB
 * and a collection at 60MB, and nothing between those caps was touched — so a
 * creator handing over ten 4000px PNGs straight from a generator burned 40MB of
 * the storage allowance for artwork that renders in a 183px card, and every
 * visitor then downloaded the originals.
 *
 * Both costs come from the same fact: the file is far larger than anything that
 * displays it. Resizing at the door fixes storage, bandwidth and page speed at
 * once, and it is the only point where it can be fixed — once pinned, a CID is
 * permanent and the bytes it addresses can never change.
 *
 * ## What it will not do
 *
 * It never enlarges, never re-encodes something already small enough to be
 * fine, and never returns a result bigger than what it was given. A file that
 * gains nothing is passed through untouched, because re-encoding an
 * already-good JPEG only loses detail.
 *
 * SVG and GIF are passed through whole: rasterising a vector throws away the
 * thing that made it worth minting, and sharp would flatten an animation to its
 * first frame.
 */

/**
 * Longest edge, in pixels.
 *
 * The largest slot in this app is a token page's hero at roughly 720 CSS px,
 * which is 1440 on a 2x display. 1500 covers that with room, and is far beyond
 * what any card, grid or wallet preview asks for.
 */
const MAX_EDGE = 1500;

/**
 * Below this, leave a correctly-sized file alone. Re-encoding to save 40KB is
 * not worth the generation loss on artwork that is kept forever.
 */
const REENCODE_ABOVE = 500 * 1024;

/** Formats where re-encoding would destroy the point of the file. */
const PASS_THROUGH = /^image\/(svg\+xml|gif)$/;

export interface OptimisedFile {
  /** Possibly renamed — the extension follows the encoding actually used. */
  name: string;
  content: Uint8Array;
  type: string;
  /** For reporting back to the creator; the route logs the saving. */
  originalBytes: number;
  optimisedBytes: number;
}

function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot === -1 ? name : name.slice(0, dot)}.${ext}`;
}

export async function optimiseArtwork(
  name: string,
  content: Uint8Array,
  type: string,
): Promise<OptimisedFile> {
  const unchanged: OptimisedFile = {
    name,
    content,
    type,
    originalBytes: content.byteLength,
    optimisedBytes: content.byteLength,
  };

  if (PASS_THROUGH.test(type)) return unchanged;

  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(content, { failOn: "none" });
    meta = await image.metadata();
  } catch {
    // Not something sharp can read. The route has already checked the declared
    // MIME type; storing it unchanged is better than rejecting a file that may
    // be perfectly valid and merely unusual.
    return unchanged;
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) return unchanged;

  const oversized = Math.max(width, height) > MAX_EDGE;
  const heavy = content.byteLength > REENCODE_ABOVE;
  if (!oversized && !heavy) return unchanged;

  // `withoutEnlargement` matters: a 400px source stays 400px rather than being
  // blown up to 1500 and gaining nothing but bytes.
  const resized = image.resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  /**
   * Alpha decides the format. WebP carries transparency at a fraction of PNG's
   * size and every wallet and marketplace renders it; JPEG cannot carry alpha
   * at all, so a cut-out would gain a black background.
   */
  const encoded = meta.hasAlpha === true
    ? await resized.webp({ quality: 90, alphaQuality: 90, effort: 4 }).toBuffer()
    : await resized.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

  // Small or already-efficient files can come out larger. Keep whichever wins.
  if (encoded.byteLength >= content.byteLength) return unchanged;

  const ext = meta.hasAlpha === true ? "webp" : "jpg";
  return {
    name: withExtension(name, ext),
    content: new Uint8Array(encoded),
    type: meta.hasAlpha === true ? "image/webp" : "image/jpeg",
    originalBytes: content.byteLength,
    optimisedBytes: encoded.byteLength,
  };
}
