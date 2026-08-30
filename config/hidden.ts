/**
 * Collections the marketplace does not list.
 *
 * A deployed contract cannot be deleted, and the factory's registry is
 * append-only by design — a registry an owner could rewrite would be worth
 * very little. So "removing" a collection means this marketplace stops
 * *listing* it, which is the only honest thing a frontend can do.
 *
 * What that does and does not mean:
 *
 *   - Hidden everywhere collections are enumerated: the home page, /collections,
 *     /mint, /market and the portfolio grouping.
 *   - **Still reachable** at /collection/<address> and still fully functional on
 *     chain. Anyone holding one still owns it, and can still trade it. Pretending
 *     otherwise would be lying about state we do not control.
 *
 * Addresses are compared lowercased, so case here does not matter.
 */

export interface HiddenCollection {
  address: string;
  /** Why it is hidden — so a future reader can judge whether it still should be. */
  reason: string;
}

export const HIDDEN_COLLECTIONS: HiddenCollection[] = [
  {
    address: "0xb16fA0aA3DaB0770E076480EAa8D3E8319eA3675",
    reason: "alpha (ALPH) — throwaway collection made while testing the create flow",
  },
  {
    address: "0x55fc6A7519c1b3dC07573cE1473fe0573D4CF716",
    reason: "vv (VVV) — throwaway collection made while testing the create flow",
  },
];

/**
 * Additional addresses from the environment, comma separated.
 *
 * The list above is compiled into the bundle, so adding to it means editing
 * code, opening a pull request and waiting for a deploy. That is an acceptable
 * pace for tidying away two test collections and far too slow for the reason
 * this list will actually be needed: the marketplace indexes every ERC-721 on
 * the chain, so an impersonation, a scam or an illegal image appears here by
 * itself and has to be able to disappear in minutes.
 *
 * `NEXT_PUBLIC_` because the check runs in the browser, where the list is
 * enumerable anyway — every address in it is public on chain by definition, so
 * there is nothing here to keep secret.
 *
 * Changing it on Vercel is a redeploy of the same build, not a code change.
 */
const fromEnv = (process.env.NEXT_PUBLIC_HIDDEN_COLLECTIONS ?? "")
  .split(",")
  .map((a) => a.trim().toLowerCase())
  .filter((a) => /^0x[0-9a-f]{40}$/.test(a));

const hidden = new Set([
  ...HIDDEN_COLLECTIONS.map((c) => c.address.toLowerCase()),
  ...fromEnv,
]);

export function isHidden(address: string): boolean {
  return hidden.has(address.toLowerCase());
}

/** How many addresses are suppressed, and how many came from the environment. */
export const hiddenCount = { total: hidden.size, fromEnv: fromEnv.length };
