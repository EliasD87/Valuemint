import {
  readFulfilment,
  readOrder,
  type OrderParameters,
  type ReceivedItem,
  type SpentItem,
} from "@/lib/seaport";

/**
 * Chain events as feed rows.
 *
 * Lifted out of `useActivity` without a behavioural change when the index
 * arrived, for the same reason `lib/orderBook.ts` exists: there are now two
 * ways these logs reach a page — scanned live, or read from a cached copy —
 * and a rule that lives inside one of them is a rule the other silently skips.
 *
 * `readFulfilment` is the rule that matters most here, and it is why the index
 * stores events raw rather than pre-digested. Sale history is a price signal:
 * ungated, it lets a wash trade in a token the attacker minted show as "last
 * sale 1,000,000" to everyone valuing the piece. Keeping the decision in one
 * function, on the client, is what stops the cached path becoming a second,
 * laxer door.
 */

export type ActivityKind = "sale" | "listed" | "cancelled" | "offer";

export interface ActivityRow {
  kind: ActivityKind;
  collection: `0x${string}`;
  tokenId: bigint;
  /** Units moved. Always 1n for ERC-721; the lot size for an edition. */
  amount: bigint;
  /** Per unit, so an edition sale is comparable with a single-piece one. */
  price?: bigint;
  from?: `0x${string}`;
  to?: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
}

/** A decoded log, however it arrived. */
export interface ActivityLog {
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex?: number;
  /**
   * What a cancellation is about, when the source already knows.
   *
   * `OrderCancelled` carries only a hash, so the token it freed has to come
   * from that order's own `OrderValidated` — which works when the whole history
   * is in front of you and stops working the moment it is narrowed. A
   * collection's query returns that collection's cancellations, but the
   * validation that explains one could be thousands of rows outside the window,
   * and the cancellation would silently vanish from its own collection's feed.
   *
   * The index resolves it at write time and passes it here. The scanned path
   * leaves it unset and falls back to looking, exactly as before.
   */
  collection?: `0x${string}`;
  tokenId?: bigint;
}

/**
 * The three streams, each possibly missing.
 *
 * `undefined` means that stream could not be read — a node refusing one topic
 * filter, or an index that holds no rows of that kind. It is distinct from an
 * empty array, which means it was read and there was nothing there. Conflating
 * the two is how "nothing has traded here yet" gets printed over a failure to
 * look.
 */
export interface ActivityStreams {
  validated?: ActivityLog[];
  fulfilled?: ActivityLog[];
  cancelled?: ActivityLog[];
}

export function buildActivityRows(streams: ActivityStreams): ActivityRow[] {
  const rows: ActivityRow[] = [];

  /** Order hash -> what it was, so a cancellation can say which token it freed. */
  const known = new Map<string, { collection: `0x${string}`; tokenId: bigint }>();

  for (const log of streams.validated ?? []) {
    const params = log.args.orderParameters as OrderParameters | undefined;
    const hash = log.args.orderHash as string | undefined;
    if (params === undefined) continue;

    const read = readOrder(params);
    if (read === undefined) continue;

    if (hash !== undefined && read.tokenId !== undefined) {
      known.set(hash.toLowerCase(), { collection: read.collection, tokenId: read.tokenId });
    }

    rows.push({
      kind: read.kind === "listing" ? "listed" : "offer",
      collection: read.collection,
      /**
       * A collection-wide offer names no token. It is still activity worth
       * showing on the collection, so it is recorded against id 0 and only
       * ever surfaces in the unfiltered feed.
       */
      tokenId: read.tokenId ?? 0n,
      amount: read.amount,
      price: read.priceWei,
      from: read.maker,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex ?? 0,
    });
  }

  for (const log of streams.fulfilled ?? []) {
    const sale = readFulfilment(
      log.args.offerer as `0x${string}`,
      log.args.recipient as `0x${string}`,
      (log.args.offer ?? []) as readonly SpentItem[],
      (log.args.consideration ?? []) as readonly ReceivedItem[],
    );
    if (sale === undefined) continue;

    rows.push({
      kind: "sale",
      collection: sale.collection,
      tokenId: sale.tokenId,
      amount: sale.amount,
      // Per unit, so an edition sale sits on the same scale as a single.
      price: sale.amount > 0n ? sale.priceWei / sale.amount : sale.priceWei,
      from: sale.seller,
      to: sale.buyer,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex ?? 0,
    });
  }

  for (const log of streams.cancelled ?? []) {
    /**
     * `OrderCancelled` carries only the hash, so the token is recovered from
     * the order's own `OrderValidated`. An order cancelled without ever being
     * validated on chain has no row here - correctly, since nothing in this app
     * ever showed it.
     */
    const hash = log.args.orderHash as string | undefined;
    const was =
      log.collection !== undefined
        ? { collection: log.collection, tokenId: log.tokenId ?? 0n }
        : hash === undefined
          ? undefined
          : known.get(hash.toLowerCase());
    if (was === undefined) continue;

    rows.push({
      kind: "cancelled",
      collection: was.collection,
      tokenId: was.tokenId,
      amount: 1n,
      from: log.args.offerer as `0x${string}`,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex ?? 0,
    });
  }

  // Newest first. `logIndex` breaks ties inside a block, which matters:
  // a listing and its sale can land in the same one.
  rows.sort((x, y) =>
    x.blockNumber === y.blockNumber
      ? y.logIndex - x.logIndex
      : x.blockNumber > y.blockNumber
        ? -1
        : 1,
  );

  return rows;
}
