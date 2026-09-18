"use client";

import Image from "next/image";
import { useState } from "react";
import { canOptimise } from "@/lib/media";

/**
 * A piece of collection artwork.
 *
 * IPFS serves exactly what was pinned and offers no smaller variant, so a
 * thumbnail slot can end up downloading a multi-megabyte original. Where the
 * host is one we allow, Next resizes and re-encodes it for the slot; anywhere
 * else it renders as a plain <img> rather than failing, because collection
 * metadata may legitimately point at a host we have never seen.
 *
 * `sizes` is not optional in practice - without it Next assumes the image
 * spans the viewport and picks a needlessly large source.
 */
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
   * The optimiser can fail on artwork that is perfectly fine.
   *
   * It fetches the original itself, and an IPFS gateway is under no obligation
   * to be quick about it. TestCybereator's artwork is a **6.58 MB animated
   * GIF** that takes 12.2s from `gateway.pinata.cloud`; the optimiser gives up
   * around 7s and answers 500, and `next/image` has no opinion about that
   * beyond rendering a broken image. Measured directly, with no app code
   * involved: `/_next/image?url=<that gif>` → HTTP 500, while the same URL
   * fetched plainly → 200.
   *
   * A broken image icon is the worst available outcome, because the artwork is
   * reachable - we just asked for it through something that gave up. So on
   * error the original is loaded directly. It costs the full file, which for
   * that GIF is 6.58 MB, and it is strictly better than showing nothing.
   *
   * Keyed on `src` so a card that recycles to different artwork gets a fresh
   * attempt at the optimiser rather than inheriting the previous one's failure.
   */
  const [failed, setFailed] = useState<string | undefined>(undefined);

  if (!canOptimise(src) || failed === src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(src)}
      // The parent slot already clips and sets the aspect; `cover` keeps the
      // art from distorting inside it.
      style={{ objectFit: "cover" }}
    />
  );
}
