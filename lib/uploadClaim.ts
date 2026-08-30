/**
 * The signed claim, shared by both sides.
 *
 * The browser builds this text to sign it; the server rebuilds it to recover
 * the signer. If the two ever differ by a single character the recovered
 * address is wrong and every upload fails, so they cannot be written twice -
 * this module is deliberately isomorphic and carries no `server-only` import.
 *
 * The verification that uses it lives in lib/uploadAuth.ts, which is server
 * only. Nothing secret is in here.
 */

/**
 * The headers the browser sends the claim in.
 *
 * Here rather than in uploadAuth.ts so the client can import them too - they
 * were previously spelled out again at the fetch call site, which is a rename
 * away from silently breaking every upload.
 */
export const CLAIM_HEADERS = {
  address: "x-valuemint-address",
  signature: "x-valuemint-signature",
  issuedAt: "x-valuemint-issued-at",
} as const;

export interface UploadClaim {
  address: string;
  collectionName: string;
  issuedAt: string;
  digest: string;
}

/** The exact text the wallet signs. */
export function uploadMessage(claim: UploadClaim): string {
  return [
    "ValueMint - authorise artwork upload",
    "",
    `Wallet:     ${claim.address}`,
    `Collection: ${claim.collectionName}`,
    `Contents:   ${claim.digest}`,
    `Issued:     ${claim.issuedAt}`,
    "",
    "Signing this costs nothing and moves nothing. It proves you control this",
    "wallet, so nobody else can upload in your name.",
  ].join("\n");
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * SHA-256 of one file's actual bytes.
 *
 * Works in both places this runs: `crypto.subtle` is on `window` in the browser
 * and on `globalThis` in the Node runtime the route uses.
 */
export async function fileHash(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // `.slice()` yields a standalone ArrayBuffer. A Uint8Array view over a larger
  // buffer would otherwise hash the wrong range.
  return hex(await crypto.subtle.digest("SHA-256", view.slice().buffer as ArrayBuffer));
}

/**
 * A stable fingerprint of what is being uploaded.
 *
 * This is what stops a captured signature being replayed against *different*
 * files: the digest is part of the signed message, so swapping the payload
 * invalidates it.
 *
 * **It covers the bytes, not the name and size.** It used to hash `name:size`
 * pairs, which meant a captured signature stayed valid for any file with the
 * same name and the same byte length - and a same-sized image is not hard to
 * produce. The property this comment claimed was not the property the code had.
 *
 * Both sides must derive it identically, so the file list is sorted - FormData
 * ordering is not guaranteed to survive the wire - and the config string is
 * used verbatim, exactly as it is sent.
 */
export async function contentDigest(
  configJson: string,
  files: Array<{ name: string; hash: string }>,
): Promise<string> {
  const manifest = [configJson, ...files.map((f) => `${f.name}:${f.hash}`).sort()].join("\n");
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(manifest)));
}
