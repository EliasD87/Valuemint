"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { enumerableAbi } from "@/config/erc721";
import { useMintedIds } from "@/hooks/useMintedIds";

/**
 * The ids of the first `limit` tokens in a collection.
 *
 * Asked, never assumed — and that distinction has now cost this project twice.
 *
 * The first time, The Trenches encoded the tier in the id, so its first token
 * is 1000001. Every surface that guessed `1, 2, 3` found nothing there and drew
 * an empty placeholder over a collection that had tokens in it. The answer was
 * `tokenByIndex`, which is correct whatever the numbering.
 *
 * The second time was worse, because the guess did not come back empty — it
 * came back wrong. `tokenByIndex` is ERC721**Enumerable**, an optional
 * extension, and for a collection without it this hook fell back to `1..n`
 * unchecked. TestSoDEXTreasureBox has a supply of 3,121 whose lowest id is
 * 4,408, because its pieces are task rewards handed out as people earn them and
 * the numbering follows nothing. So its collection page drew sixty cards for
 * tokens #1 to #60 that do not exist — permanent skeletons, no owner, each
 * linking to a token page for nothing — while all 3,121 real pieces stayed
 * invisible. Fabricated inventory is a worse failure than an empty grid.
 *
 * So there are two ways to get ids now, and one rule:
 *
 *   `tokenByIndex`   the contract's own answer. Trusted outright.
 *   `useMintedIds`   for collections that have no such answer. Candidates from
 *                    the explorer and from `1..limit`, every one of them
 *                    confirmed against `ownerOf` before it is returned.
 *
 * The rule is that an unconfirmed id never reaches the page. `1..n` survives as
 * a *candidate* — it is exactly right for a sequential collection that simply
 * skipped Enumerable, and it keeps those working if the explorer is down — but
 * it now has to prove itself like everything else.
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

  /**
   * Enumerable ids, or nothing.
   *
   * A partially-successful read is still only the entries that succeeded; the
   * gaps are not filled in, because filling them in is the bug above.
   */
  const enumerated = useMemo(() => {
    if (data === undefined) return [];
    return data
      .map((entry) => (entry?.status === "success" ? (entry.result as bigint) : undefined))
      .filter((id): id is bigint => id !== undefined);
  }, [data]);

  /**
   * Whether the contract answered at all.
   *
   * Only once the read has landed (`data !== undefined`) and produced nothing
   * is the collection genuinely not Enumerable. Deciding earlier would fire the
   * fallback on every first render, including for the eleven collections here
   * that answer `tokenByIndex` perfectly well.
   */
  const notEnumerable = count > 0 && data !== undefined && enumerated.length === 0;

  const { ids: recovered } = useMintedIds(collection, notEnumerable, limit);

  return useMemo(
    () => (enumerated.length > 0 ? enumerated : recovered),
    [enumerated, recovered],
  );
}
