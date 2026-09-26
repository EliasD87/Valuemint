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
/**
 * `=== "development"`, not `!== "production"`.
 *
 * The negative form fails *open*: an unset or unexpected NODE_ENV made `isDev`
 * true, which relaxed `frame-ancestors` and dropped `X-Frame-Options` entirely
 * — on a site that signs wallet transactions. This form fails closed, so
 * anything other than an explicit development build gets the locked headers.
 */
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      /**
       * `default-src` first, and it is the entry that was missing.
       *
       * CSP has no implicit restriction: a directive that is absent, with no
       * `default-src` to fall back to, is entirely unconstrained. The previous
       * policy named only four directives, so `script-src`, `connect-src`,
       * `img-src` and the rest were not "incomplete" — they imposed nothing at
       * all, and the policy offered no protection against injected script.
       *
       * That matters more here than on most sites. The realistic attack on a
       * wallet dApp is a compromised dependency injecting a drainer that prompts
       * `setApprovalForAll` to an attacker's address, and `connect-src` is the
       * control that contains it after the fact.
       */
      "default-src 'self'",

      /**
       * `'unsafe-inline'` is not a choice yet: Next inlines its bootstrap and
       * the theme script in layout.tsx must run before first paint. Removing it
       * needs nonces threaded through both, which is its own piece of work.
       * Stated here so it is a known debt rather than an oversight.
       *
       * `va.vercel-scripts.com` is Vercel Web Analytics, and leaving it out is
       * what stopped analytics working. `<Analytics />` injects a script tag
       * from that host, `script-src 'self'` refused it, and the only sign was a
       * console line on the visitor's machine - the dashboard simply stayed
       * empty, which reads as "not set up yet" rather than "blocked". The
       * beacons it sends go to /_vercel/insights on our own origin, so
       * `connect-src 'self'` already covers those.
       */
      /**
       * `'unsafe-eval'` in development only, and never in production.
       *
       * React's development build uses `eval` for debugging - reconstructing
       * call stacks across the server/client boundary, mainly - so without it
       * every local page load throws a console error. The production build
       * never calls `eval`, so the deployed policy keeps refusing it.
       *
       * `isDev` is `=== "development"` rather than `!== "production"` for the
       * reason noted above: this must fail closed.
       */
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
        : "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",

      /**
       * Wallets, RPC endpoints, IPFS gateways and WalletConnect's relay all live
       * on other origins, and WalletConnect needs `wss:`. Narrower than this
       * would need every gateway enumerated, which breaks the moment a
       * collection uses one we have not listed.
       *
       * `data:` is for fully on-chain NFTs, and it was a real gap.
       *
       * A collection that stores its artwork in the contract rather than on IPFS
       * returns its whole metadata document as the tokenURI —
       * `data:application/json;base64,…` — and the app reads every document with
       * `fetch`. Without `data:` here the browser refused the request outright:
       * "Refused to connect because it violates the document's Content Security
       * Policy". So the most durable NFTs there are, the ones that need no
       * gateway at all, were the ones this marketplace could not show. Confirmed
       * against a real data: URI before this line was added.
       *
       * It costs nothing. `connect-src` exists to bound where a compromised
       * dependency could send an approval or exfiltrate to, and a `data:` URI
       * has no host and reaches no network — it is bytes already in the page.
       * `img-src` has allowed `data:` all along for exactly this reason.
       */
      /*
       * Plus a local node, in development only, so a page can be rehearsed
       * against `hardhat node` (see contracts/scripts/local-kol-rewards.mjs).
       * Plain http/ws to loopback; production never sees it.
       */
      isDev
        ? "connect-src 'self' https: wss: data: http://127.0.0.1:* ws://127.0.0.1:*"
        : "connect-src 'self' https: wss: data:",

      /**
       * `data:` because EIP-6963 wallets supply their icons as data URIs, and
       * `https:` because token artwork can legitimately live on any gateway.
       * This also bounds finding 9 — the unoptimised <img> fallback can still
       * request an arbitrary host, but only over https.
       */
      "img-src 'self' https: data: blob:",
      "font-src 'self' data:",

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
  /* The stats page was called Pulse and lived at /pulse. Permanent, so shared
     links and anything a search engine indexed land on the page they meant. */
  async redirects() {
    return [{ source: "/pulse", destination: "/stats", permanent: true }];
  },
  images: {
    remotePatterns: OPTIMISED_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
    // Art is square or near it, and never rendered larger than a card.
    imageSizes: [64, 96, 128, 192, 256, 384],
    /**
     * Trimmed from the default, because every width in a srcset is a separate
     * cold fetch of the original from an IPFS gateway.
     *
     * Next appends the full `deviceSizes` list to any `fill` image, so a 160px
     * card was being offered ten candidate widths, up to 3840. Nothing on this
     * site renders artwork near that: the biggest optimised slot is a card at
     * roughly 400 CSS px, which a 3x phone tops out at ~1200. The tail was
     * pure cache surface — ten chances for a visitor to be the unlucky one who
     * waits on the gateway instead of five.
     *
     * Measured on the live site: a cold variant costs 1.5-7.6s at the gateway
     * regardless of file size, and a warm one 300-500ms. Halving the number of
     * variants halves the chance of paying that.
     */
    deviceSizes: [640, 828, 1080],
    formats: ["image/webp"],
    // Pinned content is immutable, so a long cache costs nothing and saves a
    // re-fetch of the original from the gateway on every resize.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
