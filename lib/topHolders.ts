import { deployment } from "@/config/contracts";

/**
 * The explorer's answers about one collection, as plain functions.
 *
 * Lifted out of `useTopHolders` and `useCollectionStats` (2026-10-30) so the
 * collection page can ask them on the server, where the explorer's missing
 * CORS headers do not apply, and hand the answers to the browser's cache. The
 * browser asks the same function when it has no answer, so the two cannot
 * disagree about what the explorer said.
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

/** The top holders, at most `MAX_HOLDERS`. Throws when the explorer will not answer at all. */
export async function fetchTopHolders(collection: string): Promise<Holder[]> {
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
}

interface TokenRecord {
  holders_count?: string | number | null;
  holders?: string | number | null;
}

/**
 * Unique holders, from the explorer's token record: one field, where the
 * holder list would need forty pages walked to count four thousand.
 *
 * `null` rather than 0 on anything missing or unparseable. A collection
 * genuinely can have zero holders, every piece burned, and printing that when
 * the field was missing would be a claim nobody made.
 */
export async function fetchOwnerCount(collection: string): Promise<number | null> {
  const res = await fetch(`${deployment.explorer}/api/v2/tokens/${collection}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as TokenRecord;
  const raw = body.holders_count ?? body.holders;
  if (raw === null || raw === undefined) return null;

  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
