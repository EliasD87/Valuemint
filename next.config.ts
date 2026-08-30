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
/**
 * Security headers.
 *
 * `frame-ancestors` is the one that matters most here. The live site was
 * confirmed loadable inside an iframe, and for a wallet dApp that is not
 * theoretical: an attacker frames the real marketplace, overlays invisible
 * elements on Connect / Buy / Approve, and every click the victim thinks is
 * theirs opens a wallet prompt they did not intend. Two headers are sent
 * because `X-Frame-Options` still covers older clients.
 *
 * The CSP here deliberately omits `script-src` and `connect-src`. Next inlines
 * bootstrap scripts and the app talks to wallets, RPC endpoints and IPFS
 * gateways, so a wrong value there breaks the site silently for some users.
 * That deserves its own pass with nonces rather than a guess bundled into a
 * security fix.
 */
/**
 * `frame-ancestors 'none'` also blocks the local preview pane from framing the
 * dev server, which means the page never composites: screenshots come back
 * blank, `getComputedStyle` returns every transition's start value forever, and
 * intervals are throttled to a crawl. Design work then has to be done blind, by
 * measuring geometry instead of looking at the page.
 *
 * So in development only, the site is framable from localhost. Production is
 * untouched — `next build` and `next start` both set NODE_ENV to production, so
 * the deployed site keeps 'none' and the `X-Frame-Options: DENY` below.
 */
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      isDev ? "frame-ancestors 'self' http://localhost:* http://127.0.0.1:*" : "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // X-Frame-Options has no origin list — it is DENY or nothing — and it would
  // override the CSP above for the pane, so in development it is simply not
  // sent. Every browser that matters honours frame-ancestors.
  ...(isDev ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrers leak the page a visitor came from to every explorer and IPFS
  // gateway the site links out to.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Two years, subdomains included, and eligible for the preload list.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
