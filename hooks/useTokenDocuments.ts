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
        /**
         * `null`, never `undefined`.
         *
         * React Query v5 treats an `undefined` return as a programming error —
         * "Query data cannot be undefined" — and then errors the query and
         * retries it. But "this token has no readable metadata" is a perfectly
         * ordinary answer here: SoDEX serves its treasure-box documents with
         * HTTP 501, some collections publish none at all, and a gateway can
         * simply refuse. Those became failed queries with retries behind them,
         * three requests each, for an answer we already had.
         *
         * `null` is a value, so the query succeeds and holds "nothing", which is
         * the truth. It is mapped back to `undefined` at the boundary because
         * that is what every consumer of a metadata document expects.
         */
        queryFn: () => loadTokenDocument(url, 20_000).then((d) => d ?? null).catch(() => null),
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
    documents: results.map((r) => (r.data ?? undefined) as TokenMetadata | undefined),
    isLoading: anyFetching && noneYet,
  };
}
