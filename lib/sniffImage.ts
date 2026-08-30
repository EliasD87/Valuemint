import "server-only";

/**
 * What an uploaded file actually is, decided from its bytes.
 *
 * `File.type` in a multipart upload is whatever the client wrote in the part's
 * Content-Type header. It is not derived from the content and nothing verifies
 * it, so `image/svg+xml` on a payload of anything at all used to be enough to
 * have that payload pinned to IPFS and referenced from a permanent contract:
 * SVG and GIF were passed through unprocessed, so no decoder ever looked at
 * them.
 *
 * Everything else went through sharp, which rejects non-images as a side
 * effect. This closes the two-format hole by making the bytes authoritative for
 * every format, so nothing is stored on the strength of a header again.
 */

export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "image/svg+xml";

const starts = (b: Uint8Array, sig: number[], at = 0): boolean =>
  sig.every((byte, i) => b[at + i] === byte);

/**
 * SVG is text, so it has no magic number. The test is that the first real
 * markup is an `<svg` root, allowing a BOM, whitespace, an XML declaration and
 * comments before it — and nothing else.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  // 1 KB is far past any legitimate prologue and bounds the work on a big file.
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 1024))
    .replace(/^﻿/, "")
    .trimStart();

  let rest = head;
  // Strip an XML declaration and any leading comments or doctype.
  for (;;) {
    const before = rest;
    rest = rest.replace(/^<\?xml[^>]*\?>/i, "").trimStart();
    rest = rest.replace(/^<!--[\s\S]*?-->/, "").trimStart();
    rest = rest.replace(/^<!DOCTYPE[^>]*>/i, "").trimStart();
    if (rest === before) break;
  }

  // `/` belongs in the class: `<svg/>` is a valid, if empty, document. Without
  // it the delimiter set excluded the shortest legal SVG there is.
  return /^<svg[\s>/]/i.test(rest);
}

/**
 * Returns the real type, or `undefined` for anything not recognised as one of
 * the formats we are willing to store.
 */
export function sniffImage(bytes: Uint8Array): SniffedType | undefined {
  const n = bytes.byteLength;

  /**
   * Each signature is guarded by its own length, not by one blanket minimum.
   *
   * A single `n < 12` gate at the top read well and was wrong: the shortest
   * legal SVG document is six bytes, so `<svg/>` was rejected as unidentifiable
   * rather than recognised and refused — a different answer, and the wrong one,
   * since the two produce different messages.
   */

  // JPEG: FF D8 FF
  if (n >= 3 && starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (n >= 8 && starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (n >= 6 && starts(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39)) {
    return "image/gif";
  }

  // RIFF....WEBP - both halves, or every other RIFF container matches too.
  if (n >= 12 && starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  // ISO-BMFF box "ftyp" at offset 4, with an AVIF brand.
  if (n >= 12 && starts(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = new TextDecoder("latin1").decode(bytes.subarray(8, 12));
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  if (n >= 5 && looksLikeSvg(bytes)) return "image/svg+xml";

  return undefined;
}

/**
 * SVG is the one format here that is a program rather than a picture. A pinned
 * SVG carrying a script executes on whatever origin renders it — an IPFS
 * gateway, a wallet's preview pane, another marketplace — and it is permanent.
 *
 * Refusing it outright is the honest call: sanitising SVG well is a library's
 * worth of work and a standing source of bypasses, and creator artwork here is
 * raster in every real case. The message says what to do instead.
 */
export const SVG_REFUSAL =
  "SVG artwork isn't accepted, because an SVG can carry scripts and what gets pinned is permanent. Export it as PNG or WebP and upload that.";
