"use client";

import { useQuery } from "@tanstack/react-query";
import { deployment } from "@/config/contracts";

/**
 * Who holds the most of one collection.
 *
 * From the explorer rather than the chain, and that is the whole design
 * decision. There is no contract call for "who owns the most": answering it
 * on chain means reading `ownerOf` for every token and counting, which for
 * Cybereator is 2,968 reads a visitor would pay for to see ten rows. The
 * explorer already maintains this index for its own pages.
 *
 * The cost is a dependency on somebody else's uptime, which is why a failure
 * here says so rather than rendering an empty list. "Nobody holds this" and
 * "we could not find out who holds this" are different claims and only one of
 * them is ever true after a refused request.
 *
 * **It will not work on localhost.** The explorer sends no CORS headers for
 * this origin, so every call from a dev machine fails — the same reason
 * collection discovery is always short in development. That is the environment,
 * not a bug, and the panel says the honest thing when it happens.
 */

export interface Holder {
  address: `0x${string}`;
  /** How many of the collection this address holds. */
  count: number;
  /** A contract rather than a person — a bridge, a vault, a marketplace escrow. */
  isContract: boolean;
  /** Whatever the explorer knows it as, where it knows anything. */
  name?: string;
}

/**
 * How many to read, and why two requests rather than one.
 *
 * The explorer pages at fifty. The panel shows ten and offers the rest behind
 * "See more", so the choice is between fetching the second page up front or
 * when somebody asks — and asking is the one moment they are waiting. Two
 * requests on opening the tab, cached for five minutes, buys an expansion that
 * is instant.
 */
const MAX_HOLDERS = 100;

interface BlockscoutHolder {
  address?: {
    hash?: string;
    name?: string | null;
    is_contract?: boolean;
  };
  value?: string;
}

export function useTopHolders(collection: `0x${string}` | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ["top-holders", collection?.toLowerCase() ?? null],
    enabled: enabled && collection !== undefined,
    /**
     * Holders move when pieces trade, which is not often and never urgently.
     * Five minutes is far fresher than anybody reading a leaderboard needs.
     */
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<Holder[]> => {
      const raw: BlockscoutHolder[] = [];
      let next: Record<string, string | number> | undefined;

      /**
       * Bounded by `MAX_HOLDERS` and by the explorer running out of pages,
       * whichever comes first — never by trusting the cursor to end. A paging
       * loop with only the server's word for when to stop is a loop.
       */
      for (let page = 0; page < 4 && raw.length < MAX_HOLDERS; page++) {
        const query =
          next === undefined
            ? ""
            : `?${new URLSearchParams(
                Object.entries(next).map(([k, v]) => [k, String(v)]),
              ).toString()}`;

        const res = await fetch(
          `${deployment.explorer}/api/v2/tokens/${collection}/holders${query}`,
          { signal: AbortSignal.timeout(20_000) },
        );
        if (!res.ok) {
          /** A later page failing should not throw away the ones that worked. */
          if (raw.length > 0) break;
          throw new Error(`Explorer returned ${res.status}`);
        }

        const body = (await res.json()) as {
          items?: BlockscoutHolder[];
          next_page_params?: Record<string, string | number> | null;
        };

        const items = body.items ?? [];
        raw.push(...items);

        next = body.next_page_params ?? undefined;
        if (next === undefined || items.length === 0) break;
      }

      return raw.slice(0, MAX_HOLDERS).flatMap((item): Holder[] => {
        const hash = item.address?.hash;
        if (hash === undefined) return [];

        /**
         * `value` is a decimal string and can exceed what a number holds for an
         * ERC-1155 with a large supply. Parsed through `BigInt` first so a
         * silent rounding cannot reorder the leaderboard.
         */
        let count: number;
        try {
          count = Number(BigInt(item.value ?? "0"));
        } catch {
          return [];
        }
        if (count <= 0) return [];

        return [
          {
            address: hash as `0x${string}`,
            count,
            isContract: item.address?.is_contract === true,
            ...(item.address?.name ? { name: item.address.name } : {}),
          },
        ];
      });
    },
  });

  return {
    holders: query.data ?? [],
    isLoading: query.isLoading,
    /**
     * True once we know the list could not be read. Distinct from an empty
     * list, which means it was read and nobody holds anything.
     */
    unavailable: query.isError,
  };
}
