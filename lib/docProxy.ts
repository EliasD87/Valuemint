import { OPTIMISED_IMAGE_HOSTS } from "@/lib/media";

/**
 * Token documents from other people's servers, through our edge (2026-10-25).
 *
 * Our own collections' documents come from `/api/metadata`, batched and
 * cached. Everyone else's came straight from their host into every visitor's
 * browser: SoDEX's gateway for Cybereator and the Treasure Boxes, IPFS
 * gateways for the rest. Measured on /market: 36 requests to SoDEX per cold
 * visit, up to 1.5 s each, two of them failing — and SoDEX refuses localhost
 * and preview hosts by CORS, so the dev and test sites could not read them at
 * all. Through `/api/doc` the first visitor pays the trip and everyone after
 * reads Vercel's copy.
 *
 * Only these hosts. An open "fetch any URL" route is a server-side request
 * forgery waiting to happen; a fixed list of public metadata hosts is not.
 */
/**
 * `cybereator.com` from 10 November 2026: Cybereator's metadata moves there
 * from SoDEX's gateway. Its answers change while a piece is being revealed, so
 * `/api/doc` caches them by what they say rather than for a fixed time.
 */
export const DOC_PROXY_HOSTS: readonly string[] = ["mainnet-gw.sodex.dev", "cybereator.com", ...OPTIMISED_IMAGE_HOSTS];

/** Whether a document URL may go through `/api/doc`. https and a listed host only. */
export function proxyableDoc(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.username === "" && u.password === "" && DOC_PROXY_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** The `/api/doc` address for a document, or undefined if it must be fetched directly. */
export function proxiedDocUrl(raw: string): string | undefined {
  if (!proxyableDoc(raw)) return undefined;
  /*
    `r=2` for cybereator.com: the documents gained a Rarity trait and per-trait
    odds on 2026-11-10, and browsers already held a day-long copy without them.
    A new address is a new cache entry, so every visitor gets the new shape at once.
  */
  const version = raw.startsWith("https://cybereator.com/") ? "&r=2" : "";
  return `/api/doc?url=${encodeURIComponent(raw)}${version}`;
}
