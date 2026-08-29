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
  /**
   * The only reliable way to ask "what is the nth token here".
   *
   * Token ids are not required to be 1..totalSupply and a collection is free to
   * number them however it likes — The Trenches encodes the tier in the id, so
   * its first token is 1000001. Walking 1, 2, 3 finds nothing there.
   */
  {
    inputs: [{ type: "uint256", name: "index" }],
    name: "tokenByIndex",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** The ERC-721 interface id, as registered with ERC-165. */
export const ERC721_INTERFACE_ID = "0x80ac58cd" as const;
