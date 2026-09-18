"use client";

import Image from "next/image";
import { useState } from "react";
import { useMoving } from "@/hooks/useMoving";
import { canOptimise } from "@/lib/media";

/**
 * A piece of collection artwork.
 *
 * IPFS serves exactly what was pinned and offers no smaller variant, so a
 * thumbnail slot can end up downloading a multi-megabyte original. Where the
 * host is one we allow, the art is reduced and resized for the slot; anywhere
 * else it renders as a plain <img> rather than failing, because collection
 * metadata may legitimately point at a host we have never seen.
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

/**
 * And the width the *animation* is asked for, which is not the same number.
 *
 * ONE width, not one per screen size. It was 384 on desktop and 256 on a phone,
 * chosen for sharpness, and that was a bad trade for three reasons:
 *
 *   - it doubles the files. Every artwork then has a 256 AND a 384 animation,
 *     each generated and cached separately, so the cache hits half as often.
 *   - the first request for a width nobody has asked for is slow. Measured on
 *     the live CDN the moment 384 was introduced: 1,592,266 B, 8,217 ms, MISS.
 *     Until that finished, every card sat on its still — which is exactly the
 *     "why is it not playing" that prompted this.
 *   - 384 is twice the bytes of 256 (1,592,266 against 799,648) and the picture
 *     is MOVING. Sharpness is what you lose least of in an animation.
 *
 * So: 256 everywhere. Half the download, one file per artwork rather than two,
 * and it starts playing about twice as soon. The still stays at 512, so what is
 * on screen before the swap is as sharp as ever.
 */
const MOVING_WIDTH = 256;

export function Art({
  src,
  alt = "",
  sizes,
  priority = false,
  /**
   * Let this one move.
   *
   * Off by default, and deliberately so: it is on for the two grids where the
   * artwork is the point (`TokenCard`, `CollectionCard`) and off for the 56px
   * thumbnails in the offer inbox and the manage list, where an animation would
   * be unreadable and still cost its full weight.
   */
  motion = false,
}: {
  src: string;
  alt?: string;
  sizes: string;
  priority?: boolean;
  motion?: boolean;
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
   * 6.58 MB animation - and then, for a card that is on screen and a visitor
   * who wants motion, the animation instead.
   */
  const [failed, setFailed] = useState<string | undefined>(undefined);

  /**
   * Above the early return, because it is a hook. It costs nothing when
   * `motion` is false: no observer is honoured, no request is made.
   */
  const moving = useMoving(src, {
    still: STILL_WIDTH,
    moving: MOVING_WIDTH,
    enabled: motion,
    /**
     * The first row does not wait to be told it is visible.
     *
     * `priority` already means "this is on screen before any scrolling", so
     * making it prove that through an observer only delays it. Everything below
     * the fold still waits, which is what keeps a long grid from downloading
     * animations nobody scrolls to.
     */
    whenVisible: !priority,
  });

  if (!canOptimise(src) || failed === src) {
    /**
     * A host we do not proxy, or a source `/api/still` could not read.
     *
     * The original always works, and that is the whole point of the fallback:
     * artwork that is reachable must never render as a broken icon because
     * something in front of it gave up. It is also already whatever it is —
     * an animated original animates here without our help.
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
   * That both cards *and* the token page then sat on a still was a step too
   * far, and it is what the owner kept reporting: the pictures did not move.
   * They move here now, on the terms in `useMoving` - on screen only, one
   * download per distinct file however many cards share it, and not at all for
   * a visitor who has asked for less motion or less data.
   */
  return (
    <Image
      ref={moving.ref}
      src={moving.src}
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
