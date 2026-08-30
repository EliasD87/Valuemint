/**
 * WSOSO — wrapped SOSO, the chain's canonical WETH9 clone at
 * 0x5050…5050, already named in `deployment.wsoso`.
 *
 * Offers exist in ERC-20 only. `makeOffer` reverts on a zero payment token,
 * deliberately: a native-currency offer would have to either escrow the money
 * in the marketplace, which makes a non-custodial contract custodial, or hold
 * no funds at all, which makes every offer a promise that can be broken the
 * moment it is accepted. An allowance does neither — the money stays in the
 * bidder's wallet and is only moved, atomically, if the owner accepts.
 *
 * That is the same mechanism OpenSea uses WETH for, and the reason
 * `deposit()` exists on a wrapper at all.
 *
 * Hand-written rather than generated: only these five entries are used, and the
 * generator in contracts/ only knows about contracts in this repo.
 */
export const WsosoAbi = [
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "wad", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "guy", type: "address" },
      { internalType: "uint256", name: "wad", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
