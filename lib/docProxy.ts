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
export const DOC_PROXY_HOSTS: readonly string[] = ["mainnet-gw.sodex.dev", ...OPTIMISED_IMAGE_HOSTS];

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
  return proxyableDoc(raw) ? `/api/doc?url=${encodeURIComponent(raw)}` : undefined;
}
