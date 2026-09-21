import type { ReadOrder } from "@/lib/seaport";

/**
 * How much of the order book one visitor is willing to carry.
 *
 * Extracted from `useSeaportOrders` when the index arrived, because there are
 * now two ways an order reaches a page — a log scan and a cached read path —
 * and a cap that lives inside one of them protects only that one. The whole
 * point of the cap is that it cannot be bypassed, so it belongs where both
 * sources must pass through it.
 */

/**
 * The most orders one visitor will read the status of.
 *
 * Each surviving candidate costs one `getOrderStatus` plus two fillability
 * reads, batched through multicall3 but real work all the same. 2,000 is far
 * beyond any honest volume this marketplace has seen and small enough that a
 * flood degrades the oldest entries rather than the whole page.
 */
export const MAX_CANDIDATE_ORDERS = 2_000;

/**
 * The most orders any one address may occupy in the candidate set.
 *
 * The global cap alone was the wrong shape of defence. Sorting newest first and
 * slicing from the front means new orders evict old ones, so `validate(Order[])`
 * — which takes an array — let one cheap transaction publish 2,000 shaped-but-
 * worthless orders and displace every genuine listing and bid on the chain.
 *
 * The second-order effect was worse than the empty market: with a bidder's own
 * standing bids evicted, `useOwnOfferExposure` returns 0n, so the next `allow()`
 * sets the WSOSO allowance to just the bid being placed — silently revoking the
 * cover for bids already on chain.
 *
 * A per-offerer quota makes a flood displace itself rather than everyone. At
 * 200 it takes ten distinct offerers to fill the book, and each one costs a
 * funded wallet rather than an array element.
 */
export const MAX_ORDERS_PER_OFFERER = 200;

/** The shape both sources produce: enough to apply the caps, whatever else they carry. */
interface Capped {
  blockNumber: bigint;
  read: ReadOrder;
}

/**
 * Newest first, bounded globally and per offerer.
 *
 * Newest first because a genuine order is far more likely to be recent, and
 * because an old order that gets dropped is still reachable from its own
 * token's page.
 */
export function capCandidates<T extends Capped>(all: readonly T[]): T[] {
  const newestFirst = [...all].sort((a, b) => Number(b.blockNumber - a.blockNumber));

  const perOfferer = new Map<string, number>();
  const kept: T[] = [];

  for (const c of newestFirst) {
    if (kept.length >= MAX_CANDIDATE_ORDERS) break;
    const maker = c.read.maker.toLowerCase();
    const taken = perOfferer.get(maker) ?? 0;
    if (taken >= MAX_ORDERS_PER_OFFERER) continue;
    perOfferer.set(maker, taken + 1);
    kept.push(c);
  }

  if (all.length > MAX_CANDIDATE_ORDERS) {
    console.warn(
      `[order book] ${all.length} validated orders in range; showing the newest ${MAX_CANDIDATE_ORDERS}.`,
    );
  }

  return kept;
}
