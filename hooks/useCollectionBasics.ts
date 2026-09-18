"use client";

import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { ERC721_INTERFACE_ID, enumerableAbi, erc165Abi } from "@/config/erc721";

/**
 * Everything a collection page needs before it can ask for anything else.
 *
 * One multicall, one round trip. These were three separate wagmi hooks — a
 * `supportsInterface` probe, a name/symbol pair, and `totalSupply` — and each
 * got its own trip even though none of them waits on another. Measured live,
 * the collection page spent 312 ms to 3,504 ms in nine serial RPC round trips
 * of roughly 320 ms each, and artwork cannot be named until the reads that
 * name it have landed.
 *
 * It lives in its own file for a second reason, which is the important one:
 * the home page pre-reads collections in the background so that opening one is
 * instant, and that only works if it issues *exactly* this call. wagmi keys its
 * cache on the contracts array, so a warmer holding its own copy of this list
 * would drift on the first edit and quietly fetch everything twice — once
 * uselessly on the home page, once again on arrival. There is one list, here.
 */
export function useCollectionBasics(collection: `0x${string}` | undefined) {
  const base = { address: collection, abi: erc721Abi } as const;

  const { data, isLoading, isFetched } = useReadContracts({
    contracts: [
      {
        address: collection,
        abi: erc165Abi,
        functionName: "supportsInterface" as const,
        args: [ERC721_INTERFACE_ID],
      },
      { ...base, functionName: "name" as const },
      { ...base, functionName: "symbol" as const },
      { address: collection, abi: enumerableAbi, functionName: "totalSupply" as const },
    ],
    /**
     * `retry: false` because a contract that is not an ERC-721, or has no
     * `totalSupply`, must fail fast — those reverts are answers, not errors.
     */
    query: { enabled: collection !== undefined, retry: false },
  });

  return {
    isErc721: data?.[0]?.status === "success" ? (data[0].result as boolean) : undefined,
    name: data?.[1]?.status === "success" ? (data[1].result as string) : undefined,
    symbol: data?.[2]?.status === "success" ? (data[2].result as string) : undefined,
    /**
     * `totalSupply` belongs to the Enumerable extension, which is optional, so
     * `undefined` means both "not answered yet" and "this contract has none".
     * `supplyKnown` is what separates them — the page told visitors "this
     * collection doesn't publish a token list" on first paint before it could
     * possibly know, then replaced itself with the grid a second later.
     */
    supply: data?.[3]?.status === "success" ? (data[3].result as bigint) : undefined,
    supplyKnown: isFetched,
    probing: isLoading,
  };
}
