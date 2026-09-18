"use client";

import Image from "next/image";
import { useState } from "react";
import { canOptimise, stillUrl } from "@/lib/media";

/**
 * A piece of collection artwork.
 *
 * IPFS serves exactly what was pinned and offers no smaller variant, so a
 * thumbnail slot can end up downloading a multi-megabyte original. Where the
 * host is one we allow, the art is reduced to a still and resized for the slot;
 * anywhere else it renders as a plain <img> rather than failing, because
 * collection metadata may legitimately point at a host we have never seen.
 *
 * `sizes` is not optional in practice - without it Next assumes the image
 * spans the viewport and picks a needlessly large source.
 */

/**
 * The width `/api/still` is asked for.
 *
 * Sent as `size` rather than `w`: `next/image` treats `w` as its own and strips
 * it from a src it is handed.
 *
 * The largest slot any caller uses is ~380px, so 512 covers a 2x screen without
 * asking for more than the source has. One width for every caller keeps the CDN
 * cache to one entry per image instead of one per slot.
 */
const STILL_WIDTH = 512;

export function Art({
  src,
  alt = "",
  sizes,
  priority = false,
}: {
  src: string;
  alt?: string;
  sizes: string;
  priority?: boolean;
}) {
  /**
   * Still `next/image`, and deliberately so.
   *
   * The obvious move was to replace it with a plain `<img>` pointing at
   * `/api/still`. That would have been a silent layout bug: `<Image fill>`
   * injects `position: absolute; inset: 0; object-fit: cover` inline, eight
   * callers rely on it, and only some of them set those properties in their own
   * CSS. This file's own history has that exact failure recorded in hero.css -
   * artwork that loaded fine and rendered 353x579 inside a 278px box.
   *
   * So the component is unchanged and only the *source* moves. Next still does
   * the layout and the srcset; it just fetches an 8 KB still instead of a
   * 6.58 MB animation.
   */
  const [failed, setFailed] = useState<string | undefined>(undefined);

  if (!canOptimise(src) || failed === src) {
    /**
     * A host we do not proxy, or a source `/api/still` could not read.
     *
     * The original always works, and that is the whole point of the fallback:
     * artwork that is reachable must never render as a broken icon because
     * something in front of it gave up.
     */
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" />;
  }

  /**
   * Why this is worth a route of our own.
   *
   * `next/image` refuses to touch an animated file and passes the original
   * through - correct in general, ruinous here. Cybereator's artwork is a
   * 6.58 MB animated GIF, and *both* Cybereator contracts point all 2,968 of
   * their tokens at that one file. Measured live before this change:
   *
   *     /_next/image?url=<that gif>   200   6,577,743 B   image/gif   max-age=60
   *
   * Every visitor who saw one of those cards paid 6.58 MB, and paid it again
   * sixty seconds later. `/api/still` answers 8,976 B, immutable for a year.
   *
   * A thumbnail has never animated anything, so nothing is lost. The token page
   * renders the original directly and keeps the animation.
   */
  return (
    <Image
      src={stillUrl(src, STILL_WIDTH)}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(src)}
      unoptimized
      // The parent slot already clips and sets the aspect; `cover` keeps the
      // art from distorting inside it.
      style={{ objectFit: "cover" }}
    />
  );
}
