import "server-only";
import { privateKeyToAccount } from "viem/accounts";
import {
  CLAIM_TYPES,
  TRENCHES_ADDRESS,
  TRENCHES_CHAIN_ID,
  TRENCHES_DOMAIN,
} from "@/config/trenches";

/**
 * Signing eligibility for a claim.
 *
 * This module holds the only thing standing between a wallet and a free
 * Leviathan. The contract mints whatever `authoriser` signs for, so this key is
 * equivalent to the whole collection: anyone who obtains it can issue
 * themselves every tier.
 *
 * Consequences, all deliberate:
 *
 *   - `server-only`, so importing it from a client component is a build error
 *     rather than a key in the bundle.
 *   - The env var is `TRENCHES_SIGNER_KEY`, never prefixed `NEXT_PUBLIC_`.
 *   - It is read lazily inside the function. Read at module scope, a missing
 *     key would crash the whole route at import time, including the paths that
 *     do not need it.
 *   - The key is *not* the deployer. It signs messages only and never holds
 *     funds, so if it leaks the fix is `setAuthoriser` — one transaction — and
 *     nothing else is at risk.
 */

/**
 * How long a signature stays usable.
 *
 * Long enough to survive a slow wallet confirmation and a retry after a dropped
 * transaction; short enough that a signature captured from a browser is not
 * useful for long. It does not need to be short for safety — the signature is
 * bound to one wallet, and `claimed` is what prevents a second mint.
 */
const VALID_FOR_SECONDS = 30 * 60;

export interface ClaimAuthorisation {
  wallet: `0x${string}`;
  maxTier: number;
  deadline: number;
  signature: `0x${string}`;
}

/** Whether signing is configured at all. Lets a route answer 503 rather than throw. */
export function signerConfigured(): boolean {
  return (process.env.TRENCHES_SIGNER_KEY ?? "").length > 0 && TRENCHES_ADDRESS !== "";
}

/** The authoriser's address, for the deploy script and for diagnostics. */
export function authoriserAddress(): `0x${string}` | undefined {
  const key = process.env.TRENCHES_SIGNER_KEY;
  if (key === undefined || key === "") return undefined;
  return privateKeyToAccount(normaliseKey(key)).address;
}

/**
 * Sign "this wallet has earned up to `maxTier`".
 *
 * The caller must have established `maxTier` from the on-chain-independent
 * source of truth (the SoDEX leaderboard) *before* calling this. Nothing here
 * checks eligibility — this function's only job is to make a decision already
 * taken verifiable by the contract.
 */
export async function signClaim(
  wallet: `0x${string}`,
  maxTier: number,
): Promise<ClaimAuthorisation> {
  const key = process.env.TRENCHES_SIGNER_KEY;
  if (key === undefined || key === "") {
    throw new Error("TRENCHES_SIGNER_KEY is not set.");
  }
  if (TRENCHES_ADDRESS === "") {
    throw new Error("NEXT_PUBLIC_TRENCHES_ADDRESS is not set.");
  }
  if (!Number.isInteger(maxTier) || maxTier < 1 || maxTier > 10) {
    throw new Error(`maxTier must be 1-10, got ${maxTier}.`);
  }

  const account = privateKeyToAccount(normaliseKey(key));
  const deadline = Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS;

  const signature = await account.signTypedData({
    domain: {
      ...TRENCHES_DOMAIN,
      chainId: TRENCHES_CHAIN_ID,
      verifyingContract: TRENCHES_ADDRESS,
    },
    types: CLAIM_TYPES,
    primaryType: "Claim",
    message: { wallet, maxTier, deadline: BigInt(deadline) },
  });

  return { wallet, maxTier, deadline, signature };
}

/** Accept a key with or without the `0x`, which is the usual way to paste one wrong. */
function normaliseKey(key: string): `0x${string}` {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}
