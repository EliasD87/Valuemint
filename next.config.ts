import type { NextConfig } from "next";
import { OPTIMISED_IMAGE_HOSTS } from "./lib/media";

/**
 * Image optimisation.
 *
 * Collection artwork is pinned at full resolution - one collection's cover was
 * a 3.2 MB PNG being drawn into a 95x116 thumbnail - and IPFS gateways serve
 * exactly what was pinned, with no smaller variant to ask for. Routing those
 * through Next's optimiser resizes and re-encodes them per layout slot.
 *
 * The host list is an allowlist, not `**`. See lib/media.ts for why.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: OPTIMISED_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
    // Art is square or near it, and never rendered larger than a card.
    imageSizes: [64, 96, 128, 192, 256, 384],
    formats: ["image/webp"],
    // Pinned content is immutable, so a long cache costs nothing and saves a
    // re-fetch of the original from the gateway on every resize.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
