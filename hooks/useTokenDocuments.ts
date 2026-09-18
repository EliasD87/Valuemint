"use client";

import { useQueries } from "@tanstack/react-query";
import { resolveMediaUrl } from "@/lib/format";
import { loadTokenDocument } from "@/lib/metadataBatch";
import type { TokenMetadata } from "@/hooks/useCollection";

/**
 * The metadata for a list of tokens, one query each.
 *
 * Four hooks had written this out separately — `useEverything`,
 * `useListingFeed`, `useHoldings` and `useGenericTokens` — and all four had the
 * same shape and the same fault: a single `useQuery` wrapping
 * `fetchManyTokenMetadata`, which returns nothing until every document has
 * landed. So one slow document held a whole page blank. Measured on a cold load
 * of the live home page, polling the DOM every 200 ms:
 *
 *     608 ms  images 0
 *   4,013 ms  images 0
 *   5,011 ms  images 8      <- one batch resolving, all at once
 *   6,203 ms  images 20     <- the other
 *
 * Two instantaneous steps and never a trickle, against a fastest document of
 * 110 ms and a slowest of 6,729 ms. The page waited for the straggler.
 *
 * Here each token is its own query keyed by its URL, so:
 *
 *   - a card paints when *its* document arrives;
 *   - React Query dedupes by key, which is the hand-rolled dedupe the old path
 *     had — the treasure boxes put the tier in the URL, so 626 of them are two
 *     documents;
 *   - the cache is per document rather than per page, so the same token met
 *     again on another page is free;
 *   - and the positional hazard those four copies each carried a paragraph
 *     about is gone, because there is no array to line up against another array.
 *
 * Batching did not go away by splitting them up. `loadTokenDocument` collects
 * the asks that land together and sends them to our own metadata route as one
 * `?ids=` request, so sixty cards still cost one request on the wire.
 */
export function useTokenDocuments(uris: Array<string | undefined>): {
  documents: Array<TokenMetadata | undefined>;
  isLoading: boolean;
} {
  const results = useQueries({
    queries: uris.map((raw) => {
      const url = resolveMediaUrl(raw) ?? "";
      return {
        queryKey: ["token-metadata", url],
        enabled: url !== "",
        /** Immutable content: a document at a URL is that document forever. */
        staleTime: Infinity,
        gcTime: Infinity,
        /** Unreadable metadata is a card without a picture, never a thrown page. */
        queryFn: () => loadTokenDocument(url, 20_000).catch(() => undefined),
      };
    }),
  });

  /**
   * Loading means "nothing has arrived yet", not "something is outstanding".
   *
   * Reporting the second is what made a page wait for its slowest document,
   * which is the whole reason this hook exists.
   */
  const anyFetching = results.some((r) => r.fetchStatus === "fetching");
  const noneYet = results.length > 0 && results.every((r) => r.data === undefined);

  return {
    documents: results.map((r) => r.data as TokenMetadata | undefined),
    isLoading: anyFetching && noneYet,
  };
}
