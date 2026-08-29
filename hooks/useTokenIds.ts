"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { enumerableAbi } from "@/config/erc721";

/**
 * The ids of the first `limit` tokens in a collection.
 *
 * Asked, not assumed. Token ids are not required to run 1..totalSupply, and
 * this codebase now has a collection that proves it: The Trenches encodes the
 * tier in the id, so its first token is 1000001. Every surface that guessed
 * `1, 2, 3` — the collection card's preview strip and the collection page's
 * grid — found nothing there and rendered an empty placeholder over a
 * collection that had tokens in it.
 *
 * `tokenByIndex` is the ERC-721 Enumerable answer and is correct whatever the
 * numbering. Collections without Enumerable fail the call and fall back to the
 * sequential guess, which is right for everything from our own factory.
 */
export function useTokenIds(
  collection: `0x${string}` | undefined,
  total: bigint | undefined,
  limit = 60,
): bigint[] {
  const count = total === undefined ? 0 : Math.min(Number(total), limit);

  const { data } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: collection ?? "0x0",
      abi: enumerableAbi,
      functionName: "tokenByIndex" as const,
      args: [BigInt(i)],
    })),
    query: { enabled: collection !== undefined && count > 0, refetchInterval: 30_000 },
  });

  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const entry = data?.[i];
        return entry?.status === "success" ? (entry.result as bigint) : BigInt(i + 1);
      }),
    [count, data],
  );
}
