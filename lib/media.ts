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
export function canOptimise(src: string): boolean {
  try {
    const { hostname, protocol } = new URL(src);
    if (protocol !== "https:") return false;
    return (OPTIMISED_IMAGE_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}
