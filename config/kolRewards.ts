/**
 * The KOL claim contract (`contracts/contracts/KolRewards.sol`).
 *
 * It holds every portrait and the SOSO pool, and pays each out once to the
 * wallet recorded for it. Nothing about who funds the pool lives here or on the
 * page — only what each KOL receives.
 *
 * Deployed address, or "" before launch. With no address the page stays the
 * showcase it was: nothing is read, nothing can be claimed, and the eyebrow
 * still says "Coming soon".
 */
export const KOL_REWARDS_ADDRESS = (process.env.NEXT_PUBLIC_KOL_REWARDS_ADDRESS ?? "") as
  | `0x${string}`
  | "";

/** Only what the page calls. The full ABI lives with the contract artifacts. */
export const KOL_REWARDS_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "statusOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "wallet", type: "address" },
      { name: "isClaimed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "reward",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deadline",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "portraits",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
