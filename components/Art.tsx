"use client";

import Image from "next/image";
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
  if (!canOptimise(src)) {
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
      // The parent slot already clips and sets the aspect; `cover` keeps the
      // art from distorting inside it.
      style={{ objectFit: "cover" }}
    />
  );
}
