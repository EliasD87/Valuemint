import { CREATE_ENABLED } from "@/config/features";

/**
 * Wallets that may create collections while creation is closed to everyone
 * else (owner, 2026-11-27).
 *
 * An approved wallet, once connected, sees Create and Manage in the menu, the
 * creation wizard on /create, and its uploads are accepted by /api/pin. Every
 * other visitor sees the site exactly as before: /create says creation is
 * temporarily closed, and the menu has neither.
 *
 * To approve someone: add their wallet below, lower-case, with a note of who
 * it is, and push. That is the whole process. The list is public, like the
 * rest of this repository; an approved wallet becomes public on chain anyway
 * the moment it creates a collection.
 *
 * /api/pin enforces this too (lib/uploadAuth.ts): hiding the page alone would
 * leave the upload route open to anyone who knew it existed.
 */
export const CREATORS: readonly string[] = [
  "0xa05819883e203f27d48e98d125f9ca0103e24457", // approved 2026-11-27
  "0xe3eb2e7ded738b28043e445415c642affcc8dd1c", // approved 2026-11-27
  "0xd9d32f18f33cf307523bfaa668aeac2c46a17833", // approved 2026-11-27
  "0xa20e2797ef529911cf8a2b6432efe3dbc897fb3d", // approved 2026-11-27
  "0x4792aab453e8ae7ac7be9cad4b48204986c475b3", // approved 2026-11-27
  "0x0879a87d6d1ea21c902946f2daf80a7fad77bc84", // the owner's own wallet (made Wickborn)
];

/**
 * How many collections an approved creator may make through the site (owner,
 * 2026-11-27: "up to 2 collections each so they do not abuse it"). Counted
 * from the factories' own records of who created what, so it cannot be reset
 * by clearing anything.
 *
 * It is a limit on the site, not on chain: the factory itself is open to any
 * wallet that calls it directly, which needs a redeploy to change and was
 * accepted as fine (the marketplace already hides abuse via config/hidden.ts).
 */
export const CREATOR_LIMIT = 2;

/** Wallets the limit does not apply to: the owner's own. */
const UNLIMITED: readonly string[] = ["0x0879a87d6d1ea21c902946f2daf80a7fad77bc84"];

/** Whether this wallet may use the creation flow at all right now. */
export function canCreate(address: string | undefined | null): boolean {
  if (CREATE_ENABLED) return true;
  if (address === undefined || address === null) return false;
  return CREATORS.includes(address.toLowerCase());
}

/** How many collections this wallet may have made in total, or undefined for no limit. */
export function creationLimit(address: string | undefined | null): number | undefined {
  if (CREATE_ENABLED || address === undefined || address === null) return undefined;
  return UNLIMITED.includes(address.toLowerCase()) ? undefined : CREATOR_LIMIT;
}
