"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc721Abi, type Address } from "viem";
import { deployment } from "@/config/contracts";

/**
 * Which token ids a collection has actually minted, when it will not say.
 *
 * `tokenByIndex` is ERC721**Enumerable**, an optional extension. Where it is
 * missing, `useTokenIds` fell back to guessing `1, 2, 3 …` — which is right for
 * every collection from our own factory and wrong the moment a contract numbers
 * its tokens any other way.
 *
 * TestSoDEXTreasureBox is the proof, and it is not a near miss:
 *
 *     totalSupply()       3121
 *     lowest id on chain  4408
 *     found by 1..3121    0
 *
 * So its collection page rendered sixty cards for tokens #1 to #60 — none of
 * which exist — each a permanent skeleton with no owner and no metadata,
 * linking to a token page for nothing, while all 3,121 real pieces were
 * invisible. A guess that misses quietly is worse than no answer: it fabricates
 * inventory.
 *
 * Same shape as `useOwnedTokens`, one axis over. The explorer is asked *which
 * ids to consider* and the chain is asked *whether they are real*: every
 * candidate must answer `ownerOf` before it is shown. The explorer can
 * therefore only ever omit a token, never invent one.
 *
 * Two sources of candidates, one gate:
 *
 *   the explorer    knows the real ids, including ones nothing would guess.
 *                   These are task rewards on ValueChain - handed out as people
 *                   earn them - so the numbering follows nothing at all.
 *   1..limit        costs one extra entry in a multicall the page already makes,
 *                   and is exactly right for a collection that is sequential but
 *                   simply does not implement Enumerable. It is the safety net
 *                   for the explorer being slow, down, or wrong.
 *
 * Both are only ever *candidates*. Every id from either source must answer
 * `ownerOf` before it reaches the page, so a guess can no longer put a ghost on
 * screen - that gate is the actual fix, not the extra source.
 */

interface ExplorerInstance {
  id?: string;
}

/** The explorer pages at 50, and the grid shows 60. Two pages covers it. */
const MAX_PAGES = 3;

export function useMintedIds(
  collection: Address | undefined,
  /** Only worth asking for collections that failed `tokenByIndex`. */
  enabled: boolean,
  limit = 60,
) {
  const client = usePublicClient();

  const query = useQuery({
    queryKey: ["minted-ids", collection?.toLowerCase(), limit],
    enabled: enabled && collection !== undefined && client !== undefined,
    staleTime: 30_000,
    queryFn: async (): Promise<bigint[]> => {
      const candidates: bigint[] = [];
      const seen = new Set<string>();

      /**
       * The explorer is best-effort. It being down must not cost a sequential
       * collection its grid, so a failure here falls through to the guess
       * below rather than throwing.
       */
      try {
      let cursor: Record<string, unknown> | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(
          `${deployment.explorer}/api/v2/tokens/${collection}/instances`,
        );
        // The whole cursor. Passing one field of it back is what made the
        // owner-side version loop on the same page forever.
        for (const [k, v] of Object.entries(cursor ?? {})) {
          if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
        }

        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`explorer ${res.status}`);
        const body = (await res.json()) as {
          items?: ExplorerInstance[];
          next_page_params?: Record<string, unknown> | null;
        };

        let added = 0;
        for (const item of body.items ?? []) {
          if (item.id === undefined || seen.has(item.id)) continue;
          seen.add(item.id);
          added += 1;
          // Ask for more than the grid shows, because some will fail `ownerOf`
          // — burned, or indexed ahead of a transfer.
          if (candidates.length < limit * 2) candidates.push(BigInt(item.id));
        }

        if (candidates.length >= limit * 2) break;
        const np = body.next_page_params;
        if (np === null || np === undefined) break;
        // Advanced the cursor and learned nothing: the cursor is not moving.
        if (added === 0 && page > 0) break;
        cursor = np;
      }
      } catch {
        // Fall through to the sequential candidates.
      }

      /**
       * The safety net, appended rather than substituted.
       *
       * `ownerOf` gates it exactly like the explorer's ids, so adding it cannot
       * reintroduce the ghost cards - an id that was never minted reverts and
       * is dropped. For a sequential non-Enumerable collection this alone is
       * the right answer; for a scattered one it contributes nothing and costs
       * one multicall entry each.
       */
      for (let i = 1; i <= limit; i++) {
        if (seen.has(String(i))) continue;
        seen.add(String(i));
        candidates.push(BigInt(i));
      }

      if (candidates.length === 0) return [];

      /**
       * The explorer proposes; the chain decides.
       *
       * `ownerOf` reverts for an id that was never minted or has been burned,
       * so this is what stops a stale index putting a ghost on the page.
       */
      const checked = await client!.multicall({
        contracts: candidates.map((id) => ({
          address: collection!,
          abi: erc721Abi,
          functionName: "ownerOf" as const,
          args: [id],
        })),
        allowFailure: true,
      });

      const real: bigint[] = [];
      checked.forEach((r, i) => {
        const id = candidates[i];
        if (id === undefined || r.status !== "success") return;
        if (real.length < limit) real.push(id);
      });

      return real;
    },
  });

  return {
    ids: query.data ?? [],
    isLoading: query.isLoading,
    /**
     * Whether this has finished having an opinion.
     *
     * Not `!isLoading`: a disabled query is not loading and has not answered
     * either, and the caller needs to tell those apart. A collection that turns
     * out to have no recoverable ids has to reach a settled, empty answer -
     * otherwise the page waits on it forever and shows skeletons where it
     * should say plainly that there is nothing to list.
     */
    settled: !enabled || query.isFetched,
    /** True when the lookup was needed and could not be answered at all. */
    unavailable: enabled && query.isError,
  };
}
