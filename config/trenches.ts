/**
 * The Trenches claim contract.
 *
 * Isomorphic on purpose — the browser needs the address and ABI to send the
 * transaction, and the server needs the EIP-712 domain to sign for it. Nothing
 * secret lives here; the signing key is read only by `lib/trenchesSigner.ts`,
 * which is `server-only`.
 */

/**
 * Deployed address, or `undefined` before launch.
 *
 * The claim UI keys off this: with no address there is nothing to send a
 * transaction to, so the button stays disabled and says so rather than failing
 * at signing time.
 */
export const TRENCHES_ADDRESS = (process.env.NEXT_PUBLIC_TRENCHES_ADDRESS ?? "") as
  | `0x${string}`
  | "";

/**
 * The chain the claim contract lives on.
 *
 * Part of the EIP-712 domain, so it must match the deployment exactly — a
 * signature carrying the wrong chain id is well-formed and rejected by the
 * contract with `WrongSigner`, which looks like a key problem and is not.
 * Defaults to ValueChain mainnet; overridden only to point a local build at a
 * local chain.
 */
export const TRENCHES_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_TRENCHES_CHAIN_ID ?? "286623",
);

/** Token ids are `tier * TIER_STRIDE + serial`. Must match the contract. */
export const TIER_STRIDE = 1_000_000;

/** The slug `baseURI` points at, and the metadata route answers on. */
export const TRENCHES_SLUG = "sodex-trenches";

/**
 * EIP-712 domain. `name` and `version` must match the contract's
 * `EIP712("ValueMintTrenches", "1")` exactly, or every signature is rejected.
 */
export const TRENCHES_DOMAIN = {
  name: "ValueMintTrenches",
  version: "1",
} as const;

/** Must match `CLAIM_TYPEHASH`: same fields, same types, same order. */
export const CLAIM_TYPES = {
  Claim: [
    { name: "wallet", type: "address" },
    { name: "maxTier", type: "uint8" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Only what the app calls. The full ABI lives with the contract artifacts. */
export const TRENCHES_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "maxTier", type: "uint8" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unclaimed",
    stateMutability: "view",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "maxTier", type: "uint8" },
    ],
    outputs: [{ name: "tiers", type: "uint8[]" }],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "claimOpen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintedPerTier",
    stateMutability: "view",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Decode a token id back to its tier. Mirrors the contract's `tierOf`. */
export function tierFromTokenId(tokenId: number): number | undefined {
  const tier = Math.floor(tokenId / TIER_STRIDE);
  const serial = tokenId % TIER_STRIDE;
  if (tier < 1 || tier > 10 || serial < 1) return undefined;
  return tier;
}
