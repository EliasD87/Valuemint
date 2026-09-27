"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc721Abi, zeroAddress, type Address } from "viem";
import { useOwnedTokens } from "@/hooks/useOwnedTokens";

const ownerIndexAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Enough to find a piece that qualifies; nobody needs all of them to accept one offer. */
const MAX_IDS = 25;

/**
 * The viewer's pieces in ONE collection — for the offers strip's Accept.
 *
 * `useHoldings` answers for the whole wallet: a balance in every collection,
 * then ids, then documents, and it only settles when the slowest collection
 * has. The strip needs none of that, so its Accept arrived seconds after the
 * offers did (2026-09-27). This reads the one collection: `balanceOf`, then
 * `tokenOfOwnerByIndex`, and only for a collection without the Enumerable
 * index the Transfer-log scan `useOwnedTokens` shares with the portfolio.
 */
export function useMyPieces(
  collection: Address,
  owner: Address | undefined,
  /**
   * Whether the ids are wanted yet. The balance is read regardless — one cheap
   * call, so "you hold one" is known by the time an offer is — while the ids,
   * and above all the Transfer-log scan, wait until there is an offer to use
   * them on.
   */
  needIds = true,
) {
  const on = owner !== undefined;

  const { data: balance, isLoading: loadingBalance } = useReadContract({
    address: collection,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [owner ?? zeroAddress],
    query: { enabled: on },
  });

  const n = balance === undefined ? 0 : Math.min(Number(balance), MAX_IDS);
  const { data: idResults, isLoading: loadingIds } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: collection,
      abi: ownerIndexAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [owner ?? zeroAddress, BigInt(i)] as const,
    })),
    query: { enabled: on && needIds && n > 0 },
  });

  const enumerated = (idResults ?? []).flatMap((r) => (r.status === "success" ? [r.result as bigint] : []));
  /* No Enumerable index: every call failed, so fall back to the Transfer history. */
  const needsScan = on && needIds && n > 0 && idResults !== undefined && enumerated.length === 0;
  const { byCollection, isLoading: scanning } = useOwnedTokens(needsScan ? [collection] : [], owner);

  const ids = enumerated.length > 0 ? enumerated : (byCollection[collection.toLowerCase()] ?? []);
  const checking = on && (loadingBalance || (needIds && n > 0 && (loadingIds || (needsScan && scanning))));

  return {
    ids,
    /** Whether the viewer holds any piece here, known from one read long before the ids are. */
    holds: balance === undefined ? undefined : balance > 0n,
    checking,
  };
}
