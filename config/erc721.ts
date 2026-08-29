/**
 * Minimal ABI fragments for reading an arbitrary ERC-721.
 *
 * viem's bundled `erc721Abi` omits `supportsInterface` and the optional
 * Enumerable methods, both of which are needed to work out whether a stranger's
 * contract is tradeable here and whether its tokens can be walked.
 */
export const erc165Abi = [
  {
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const enumerableAbi = [
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** The ERC-721 interface id, as registered with ERC-165. */
export const ERC721_INTERFACE_ID = "0x80ac58cd" as const;
