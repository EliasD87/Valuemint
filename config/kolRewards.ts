/**
 * The KOL claim contract (`contracts/contracts/KolRewards.sol`).
 *
 * It holds every portrait and the SOSO pool, and pays each out once to the
 * wallet recorded for it.
 *
 * The live contract, deployed 2026-09-26 and owned by the Safe, is the default
 * — it is public and permanent, so there is no reason to make a deploy depend
 * on an environment variable being set. NEXT_PUBLIC_KOL_REWARDS_ADDRESS only
 * overrides it, to point a local build at a rehearsal contract. Set it to an
 * empty string and the page falls back to the plain showcase.
 */
const LIVE_KOL_REWARDS = "0x175B5eb9C0C0337606F6Af6922DC994314d8A96a";

export const KOL_REWARDS_ADDRESS = (process.env.NEXT_PUBLIC_KOL_REWARDS_ADDRESS ?? LIVE_KOL_REWARDS) as
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
      { name: "amount", type: "uint256" },
    ],
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
