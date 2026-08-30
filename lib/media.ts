/**
 * Which image hosts may be resized by Next's optimiser.
 *
 * This list is deliberately short. Allowing every host (`hostname: "**"`) turns
 * the deployment into an open image proxy: anyone can pass any URL through it
 * and spend the account's transformation quota on images that have nothing to
 * do with this site. Collection metadata can point anywhere, so the safe shape
 * is an allowlist plus a graceful fallback - art on an unlisted host still
 * renders, just unoptimised.
 *
 * Imported by next.config.ts, so it must stay dependency-free.
 */
export const OPTIMISED_IMAGE_HOSTS = [
  "lavender-tiny-loon-904.mypinata.cloud",
  "ipfs.filebase.io",
  "gateway.pinata.cloud",
  "ipfs.io",
  "cloudflare-ipfs.com",
  "dweb.link",
] as const;

/**
 * Whether Next may resize this image.
 *
 * Anything unrecognised - or unparseable, or a data URI - falls back to a plain
 * <img>, which always works.
 */
/**
 * Hosts the *server* may fetch metadata from.
 *
 * The gateways above, plus our own metadata route — collections created here
 * have a `baseURI` pointing at it, so a preview has to be able to read it.
 *
 * This exists because `lib/shareMeta.ts` fetches a URL that ultimately comes
 * from a caller-supplied contract's `tokenURI`. Anyone can deploy an ERC-721
 * returning `http://169.254.169.254/...` and then request that page, so without
 * a list the server will fetch whatever it is pointed at.
 *
 * An allowlist rather than an internal-IP denylist: denylists miss DNS
 * rebinding, IPv6-mapped addresses and decimal or octal IP encodings, and the
 * set of hosts that are legitimately involved here is small and known.
 */
export function metadataFetchAllowed(raw: string): boolean {
  try {
    const u = new URL(raw);
    // https only. `http:` would allow plaintext to an internal address, and
    // `file:`, `data:` and the rest have no business here at all.
    if (u.protocol !== "https:") return false;
    if ((OPTIMISED_IMAGE_HOSTS as readonly string[]).includes(u.hostname)) return true;
    return u.hostname === "www.valuemint.store" || u.hostname === "valuemint.store";
  } catch {
    return false;
  }
}

export function canOptimise(src: string): boolean {
  try {
    const { hostname, protocol } = new URL(src);
    if (protocol !== "https:") return false;
    return (OPTIMISED_IMAGE_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}
