"use client";

import { useEffect, useState } from "react";
import { stillUrl } from "@/lib/media";

/**
 * The artwork on a token page, with its animation — and something to look at
 * while that arrives.
 *
 * The token page already asked `/api/still` for every frame, and the animation
 * still did not play. Measured against the live site, this is why:
 *
 *     GET /api/still?…&animate=1     200   2,302,150 B   9,990 ms   (cold)
 *
 * Ten seconds. The `<img>` was still `complete: false` five seconds after the
 * page rendered, so the figure was empty and the visitor had nothing at all —
 * and anyone who scrolled, tapped through or simply gave up before it landed
 * never saw a single frame. The file itself was never the problem: it decodes
 * as 125 pages at 480px with `loop: 0`, which any browser plays forever.
 *
 * Nearly all of those ten seconds are one fetch — 6.58 MB of GIF out of
 * Pinata's public gateway, 8s of it — and there is nothing to be done about
 * that but not wait for it. So the still goes up first at 22 KB, usually
 * already in the browser's cache from the card the visitor clicked, and the
 * animation replaces it the moment it has decoded. Both are rendered at the
 * same width, so the swap does not move anything on the page.
 *
 * The animated copy is requested for every piece, not only the ones known to
 * move, because nothing here knows which those are: IPFS URLs carry no
 * extension and the metadata does not say. For a still image the second
 * request is one frame re-encoded, and it is not even expensive — measured
 * against a Filebase JPEG, 12,332 B against the still's 14,730 B, cached for a
 * year either way. Guessing wrong in the other direction costs the animation
 * entirely, which is the bug this file exists to fix.
 */

/** One width for both, so the swap cannot resize the figure. */
const WIDTH = 512;

export function MovingArt({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const still = stillUrl(src, WIDTH);
  const moving = stillUrl(src, WIDTH, true);

  const [shown, setShown] = useState(still);

  useEffect(() => {
    setShown(still);

    /**
     * A host `/api/still` will not fetch gets its original, untouched — which
     * is already whatever it is, animation included. There is nothing to
     * upgrade to, and preloading the same URL twice would be the only effect.
     */
    if (moving === still) return;

    let live = true;
    const pre = new window.Image();

    /**
     * On `load`, not on `decode`, and not optimistically: swapping to a URL
     * that has not arrived would replace a picture with an empty frame for ten
     * seconds — precisely the failure this is fixing. By the time `src`
     * changes the bytes are in the browser's cache, so the swap is immediate
     * and the animation starts at its first frame.
     */
    pre.onload = () => {
      if (live) setShown(moving);
    };

    /**
     * Failure is silent on purpose. `/api/still` redirects to the original
     * when it cannot process a source, so this either succeeds or leaves the
     * still on screen; a broken-image icon over working artwork would be a
     * worse answer than no animation.
     */
    pre.onerror = () => {
      if (live) setShown(still);
    };

    pre.src = moving;

    return () => {
      live = false;
      pre.onload = null;
      pre.onerror = null;
    };
  }, [still, moving]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={shown} alt={alt} decoding="async" />;
}
