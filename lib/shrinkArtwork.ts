/**
 * Shrinks artwork in the browser before it is uploaded.
 *
 * `/api/pin` already resizes every image (lib/optimiseArtwork.ts), but it can
 * only do that to bytes it receives, and Vercel refuses any request body over
 * 4.5 MB before our code runs. The refusal is a plain-text "Request Entity Too
 * Large", which the create page then tried to read as JSON. A creator saw
 * `Unexpected token 'R', "Request En"... is not valid JSON` (2026-11-27).
 *
 * Doing the same resize here, before signing, keeps ten generator-sized PNGs
 * well inside the limit. The server's pass still runs and leaves these alone,
 * since they arrive already small.
 *
 * Same rules as the server: longest edge 1500px, never enlarged, WebP where
 * there is transparency and JPEG where there is not, GIF untouched (canvas
 * would keep only the first frame), and the original kept whenever the result
 * is not smaller.
 */

const MAX_EDGE = 1500;
const REENCODE_ABOVE = 500 * 1024;

/** Vercel's request body limit is 4.5 MB; leave room for the form framing. */
export const UPLOAD_BUDGET_BYTES = 4_200_000;

function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot === -1 ? name : name.slice(0, dot)}.${ext}`;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The file to upload, and the name it goes up under (the extension follows the encoding). */
export async function shrinkArtwork(file: File, name: string): Promise<{ file: Blob; name: string }> {
  const unchanged = { file: file as Blob, name };
  if (file.type === "image/gif" || file.type === "image/svg+xml") return unchanged;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Not something this browser can decode. The server decides what it is.
    return unchanged;
  }

  try {
    const { width, height } = bitmap;
    if (width === 0 || height === 0) return unchanged;
    if (Math.max(width, height) <= MAX_EDGE && file.size <= REENCODE_ABOVE) return unchanged;

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (ctx === null) return unchanged;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // Transparency decides the format, as on the server: JPEG would paint it black.
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let alpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 255) {
        alpha = true;
        break;
      }
    }

    let blob: Blob | null;
    let ext: string;
    if (alpha) {
      // Safari cannot encode WebP and hands back a PNG instead; that is still resized.
      blob = await toBlob(canvas, "image/webp", 0.9);
      ext = blob?.type === "image/webp" ? "webp" : "png";
    } else {
      blob = await toBlob(canvas, "image/jpeg", 0.88);
      ext = "jpg";
    }

    if (blob === null || blob.size >= file.size) return unchanged;
    return { file: blob, name: withExtension(name, ext) };
  } catch {
    return unchanged;
  } finally {
    bitmap.close();
  }
}

/**
 * Shrinks every design and gives each a unique upload name. Re-encoding can
 * make "art.png" and "art.jpg" both "art.jpg", and the manifest names files.
 */
export async function shrinkAll(
  items: ReadonlyArray<{ file: File; pinnedName: string }>,
): Promise<Array<{ file: Blob; name: string }>> {
  const out: Array<{ file: Blob; name: string }> = [];
  for (const item of items) {
    const shrunk = await shrinkArtwork(item.file, item.pinnedName);
    let name = shrunk.name;
    if (out.some((o) => o.name === name)) {
      const dot = name.lastIndexOf(".");
      const base = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? "" : name.slice(dot);
      let n = 2;
      while (out.some((o) => o.name === `${base}-${n}${ext}`)) n++;
      name = `${base}-${n}${ext}`;
    }
    out.push({ file: shrunk.file, name });
  }
  return out;
}
