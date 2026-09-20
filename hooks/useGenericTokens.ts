"use client";

import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { resolveMediaUrl } from "@/lib/format";
import { useTokenDocuments } from "@/hooks/useTokenDocuments";
import type { LoadedToken } from "@/hooks/useTokens";
import { tierOf, traitOf } from "@/lib/tokenMetadata";

/**
 * Loads tokens from an arbitrary ERC-721, using only the standard interface.
 *
 * The Genesis-specific hook assumes our own traits and metadata shape. Someone
 * else's collection may have neither, so this reads what the standard guarantees
 * and treats everything beyond that as optional. A collection whose metadata is
 * unreachable still renders as a card with an id, rather than vanishing.
 *
 * ---
 *
 * **One query per token, not one query for the page.** This used to fetch every
 * token's metadata inside a single `useQuery`, eight at a time, and hand back
 * `undefined` until the last of them landed. Two things followed, both measured
 * on the live site:
 *
 *   - sixty tokens at eight concurrent is eight serial waves, and
 *   - no card could show its artwork until the slowest wave had finished, so
 *     the first image did not begin downloading until 5.70 s even though the
 *     first metadata document had arrived at 1.71 s.
 *
 * Now each token is its own query, keyed by its URL. Three things fall out of
 * that, and the third is the reason for it:
 *
 *   - React Query dedupes by key, so a collection where many tokens share a
 *     document — the treasure boxes put the tier in the URL, so 626 boxes are
 *     two documents — fetches each one once, as the old hand-rolled dedupe in
 *     `fetchManyTokenMetadata` did;
 *   - the cache is per document rather than per page, so returning to a
 *     collection, or meeting the same token in the market, is free;
 *   - **a card paints when its own document arrives.** The grid fills in as the
 *     answers come back instead of staying blank until all sixty have.
 *
 * Concurrency did not go away, it moved into `gated`, which knows the
 * difference between our own CDN and somebody else's IPFS gateway. The old
 * single limit of eight was set for the gateway and applied to both.
 */

export function useGenericTokens(
  collection: `0x${string}` | undefined,
  ids: bigint[],
  {
    /**
     * How many of these tokens to fetch metadata for. All of them, unless a
     * caller says otherwise.
     *
     * The background warmer says otherwise. Reading a collection ahead of
     * somebody is worth doing, but its metadata is the expensive half and not
     * all of it is urgent: Cybereator's documents live on a third party's host
     * with a URL per token, so they cannot be batched, and warming two
     * Cybereator collections meant 120 separate requests to an endpoint that
     * sends no cache headers — paid on every home-page visit, by people who
     * may never click.
     *
     * The ids and the token URIs above are RPC, batched into multicalls, and
     * cheap; those are warmed in full so the page finds them. Only the
     * documents are trimmed, to the rows somebody actually sees when a
     * collection opens. The rest arrive when they scroll.
     */
    documents = ids.length,
  }: { documents?: number } = {},
) {
  const { data: uriResults, isLoading: urisLoading } = useReadContracts({
    contracts: ids.map((id) => ({
      address: collection,
      abi: erc721Abi,
      functionName: "tokenURI" as const,
      args: [id],
    })),
    query: { enabled: collection !== undefined && ids.length > 0, staleTime: Infinity },
  });

  const uris = ids.map((_, i) =>
    uriResults?.[i]?.status === "success" ? (uriResults[i].result as string) : undefined,
  );

  /**
   * The same per-token loader every other surface uses.
   *
   * This hook had its own copy of it, which is how it also had its own copy of
   * the bug: a queryFn returning `undefined` makes React Query v5 error the
   * query and retry it, and "no readable metadata" is an ordinary answer here,
   * not a failure. One implementation, in useTokenDocuments.
   */
  const { documents: metadata, isLoading: loadingMeta } = useTokenDocuments(
    documents >= uris.length ? uris : uris.slice(0, documents),
  );

  const tokens: LoadedToken[] = ids.map((id, i) => {
    const m = metadata[i];
    return {
      id,
      uri: uris[i],
      metadata: m,
      // Fall back to the token's own name; not every collection uses a Design trait.
      design: traitOf(m, "Design") ?? m?.name ?? `#${id.toString()}`,
      tier: tierOf(m),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
    };
  });

  /**
   * "Still loading" means the ids are not in yet, or nothing has come back at
   * all — not that some straggler is outstanding. Reporting true until the last
   * document landed is what held the whole grid behind the slowest one.
   */
  return { tokens, isLoading: urisLoading || loadingMeta };
}
