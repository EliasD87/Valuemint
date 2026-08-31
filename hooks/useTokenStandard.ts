"use client";

import { useReadContracts } from "wagmi";

/**
 * Which token standard a collection speaks.
 *
 * The marketplace keeps ERC-721 and ERC-1155 listings in separate maps and
 * refuses the wrong function for each — `list` reverts with `NotERC721` on a
 * multi-token collection and `listMulti` reverts with `NotERC1155` on a
 * single-token one. So the UI has to know before it offers a button, and it has
 * to ask the chain rather than assume: collections arrive here from the
 * factory, from `config/known.ts` and from the explorer's index, and only the
 * first of those is guaranteed to be ERC-721.
 *
 * Asked through ERC-165, the same way the contract asks. A collection that
 * answers neither is not tradeable here at all, which is worth saying plainly
 * in the UI rather than letting someone discover it in a failed transaction.
 */

const ERC721_ID = "0x80ac58cd" as const;
const ERC1155_ID = "0xd9b67a26" as const;

const supportsInterfaceAbi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type TokenStandard = "erc721" | "erc1155" | "unknown";

export function useTokenStandard(collection: `0x${string}` | undefined): {
  standard: TokenStandard;
  isLoading: boolean;
} {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: collection,
        abi: supportsInterfaceAbi,
        functionName: "supportsInterface",
        args: [ERC721_ID],
      },
      {
        address: collection,
        abi: supportsInterfaceAbi,
        functionName: "supportsInterface",
        args: [ERC1155_ID],
      },
    ],
    query: {
      enabled: collection !== undefined,
      // A contract's answer to this cannot change, so it is worth caching hard.
      staleTime: Infinity,
      gcTime: Infinity,
    },
  });

  const is721 = data?.[0]?.status === "success" && data[0].result === true;
  const is1155 = data?.[1]?.status === "success" && data[1].result === true;

  /**
   * 721 wins a tie. Nothing should claim both, but a contract can answer
   * anything it likes to ERC-165, and the single-token path is the one the rest
   * of this app is built around — so an ambiguous answer degrades to the
   * behaviour that was already there rather than into the newer code.
   */
  return {
    standard: is721 ? "erc721" : is1155 ? "erc1155" : "unknown",
    isLoading,
  };
}
