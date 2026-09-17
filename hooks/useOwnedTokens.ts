"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc721Abi, type Address } from "viem";
import { deployment } from "@/config/contracts";

/**
 * Which tokens an address holds in a collection that cannot be asked directly.
 *
 * `tokenOfOwnerByIndex` is ERC721**Enumerable**, an optional extension. Plenty
 * of ordinary ERC-721s skip it — two on ValueChain hold 186 and 1 tokens for a
 * single wallet right now — and for those the app knew *how many* a wallet held
 * (`balanceOf` is mandatory) but not *which*. Without an id there is no token
 * page, no listing and no trade, so the portfolio said the pieces existed and
 * could not be listed. That reads as a marketplace limitation and is really a
 * missing lookup.
 *
 * Two ways to answer it, and the cheap one wins:
 *
 *   Transfer logs   correct, needs no third party, and costs a walk of the
 *                   whole chain — ~700 requests per collection at 20,000
 *                   blocks a request. Far too slow for a page load.
 *   The explorer    already indexed by owner, one request, instant.
 *
 * So the explorer answers *which ids to consider* and the chain answers
 * *whether they are still yours*. Every candidate is confirmed with `ownerOf`
 * before it counts, which means the explorer can only ever omit a token — it
 * cannot invent one, or hand you somebody else's. A wrong or hostile answer
 * costs completeness, never correctness.
 *
 * If the explorer is unreachable the hook returns nothing and the portfolio
 * falls back to saying so, rather than claiming the wallet holds nothing.
 */

/**
 * A ceiling on how many ids one collection contributes.
 *
 * Each confirmed id costs an `ownerOf`, then a `tokenURI`, then a metadata
 * fetch. A wallet holding thousands in one collection would otherwise make the
 * portfolio the most expensive page on the site.
 */
const MAX_PER_COLLECTION = 100;

/** The explorer pages at 50; this many pages is enough for any real wallet. */
const MAX_PAGES = 6;

interface ExplorerNft {
  id?: string;
  token?: { address?: string; address_hash?: string };
}

export function useOwnedTokens(
  /** Only the collections that actually need it — non-Enumerable ones. */
  collections: readonly Address[],
  owner: Address | undefined,
) {
  const client = usePublicClient();

  // Stable key: the same set in a different order is the same question.
  const key = [...collections].map((a) => a.toLowerCase()).sort().join(",");

  const query = useQuery({
    queryKey: ["owned-by-transfers", key, owner],
    enabled: client !== undefined && owner !== undefined && collections.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, bigint[]>> => {
      const wanted = new Set(collections.map((a) => a.toLowerCase()));
      const candidates = new Map<string, bigint[]>();

      /**
       * Every id exactly once.
       *
       * Paging can repeat a row — and an earlier version of this passed only
       * `items_count` back, which made the explorer return the same page
       * forever and put the same token in a wallet six times. Deduplicating is
       * the belt; passing the cursor back whole is the braces.
       */
      const seen = new Set<string>();

      let cursor: Record<string, unknown> | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(`${deployment.explorer}/api/v2/addresses/${owner}/nft`);
        url.searchParams.set("type", "ERC-721");
        // The whole cursor, not one field of it. Blockscout keys NFT paging on
        // the contract address and token id as well as the count.
        for (const [k, v] of Object.entries(cursor ?? {})) {
          if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
        }

        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`explorer ${res.status}`);
        const body = (await res.json()) as {
          items?: ExplorerNft[];
          next_page_params?: Record<string, unknown> | null;
        };

        let added = 0;
        for (const item of body.items ?? []) {
          const at = (item.token?.address_hash ?? item.token?.address ?? "").toLowerCase();
          if (at === "" || !wanted.has(at) || item.id === undefined) continue;

          const key = `${at}:${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          added += 1;

          const list = candidates.get(at) ?? [];
          if (list.length < MAX_PER_COLLECTION * 2) list.push(BigInt(item.id));
          candidates.set(at, list);
        }

        const np = body.next_page_params;
        if (np === null || np === undefined) break;
        // A page that advanced the cursor but produced nothing new means the
        // cursor is not advancing. Stop rather than loop.
        if (added === 0 && page > 0) break;
        cursor = np;
      }

      if (candidates.size === 0) return {};

      /**
       * The explorer proposes; the chain decides.
       *
       * An index can lag a transfer out, so every id is checked against
       * `ownerOf` before it reaches the portfolio as something sellable.
       */
      const flat = [...candidates.entries()].flatMap(([addr, ids]) =>
        ids.map((id) => ({ addr, id })),
      );

      const checked = await client!.multicall({
        contracts: flat.map((f) => ({
          address: f.addr as Address,
          abi: erc721Abi,
          functionName: "ownerOf" as const,
          args: [f.id],
        })),
        allowFailure: true,
      });

      const out: Record<string, bigint[]> = {};
      checked.forEach((r, i) => {
        const f = flat[i];
        if (f === undefined || r.status !== "success") return;
        if ((r.result as Address).toLowerCase() !== owner!.toLowerCase()) return;
        const list = out[f.addr] ?? [];
        if (list.length < MAX_PER_COLLECTION) list.push(f.id);
        out[f.addr] = list;
      });

      return out;
    },
  });

  return {
    /** collection (lowercased) -> the ids this address still holds. */
    byCollection: query.data ?? {},
    isLoading: query.isLoading,
    /** The lookup failed; "none" would be a claim we have not established. */
    unavailable: query.isError,
  };
}
