import {
  ItemType,
  readFulfilment,
  readOrder,
  type OrderParameters,
  type ReceivedItem,
  type SpentItem,
} from "@/lib/seaport";
import type { Address, Hex } from "viem";

/**
 * Turning chain logs into database rows, and nothing else.
 *
 * Deliberately pure and deliberately separate from the route that calls it:
 * this is the part where a mistake is silent and permanent. A misread order
 * does not throw — it writes a row that looks perfectly ordinary and quotes
 * the wrong price, or points at the wrong token, until somebody tries to buy
 * it. So it is tested rather than trusted.
 *
 * The one rule this module exists to enforce: **the index understands an order
 * exactly the way the site does.** Every row comes through `readOrder`, the
 * same door `useSeaportOrders` uses. A second implementation of "what is this
 * order" would eventually disagree with the first, and a disagreement here
 * means someone's listing showing the wrong figure.
 */

/** A row of `orders`, as PostgREST takes it. */
export interface OrderRow {
  order_hash: string;
  offerer: string;
  side: "listing" | "offer";
  collection: string;
  /** Null on a collection-wide or criteria order, which names no single token. */
  token_id: string | null;
  /** Seaport's raw criteria: null when the order names a token outright. */
  criteria: string | null;
  price_wei: string;
  currency: string;
  start_time: number;
  end_time: number;
  params: JsonOrderParameters;
  block_number: number;
  updated_at: string;
}

/** A row of `counters`. */
export interface CounterRow {
  offerer: string;
  voided_after_block: number;
}

/**
 * The parameters with every `bigint` as a decimal string.
 *
 * `JSON.stringify` throws on a bigint rather than rounding one, which is the
 * single most useful thing it does here — a silent round would produce an
 * order whose salt is off by one and which Seaport then refuses, with nothing
 * anywhere saying why. Strings survive the round trip exactly.
 */
export interface JsonOrderParameters {
  offerer: string;
  zone: string;
  offer: ReadonlyArray<{
    itemType: number;
    token: string;
    identifierOrCriteria: string;
    startAmount: string;
    endAmount: string;
  }>;
  consideration: ReadonlyArray<{
    itemType: number;
    token: string;
    identifierOrCriteria: string;
    startAmount: string;
    endAmount: string;
    recipient: string;
  }>;
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  totalOriginalConsiderationItems: string;
}

/** Every bigint out, as a string. */
export function encodeParams(p: OrderParameters): JsonOrderParameters {
  return {
    offerer: p.offerer,
    zone: p.zone,
    offer: p.offer.map((i) => ({
      itemType: i.itemType,
      token: i.token,
      identifierOrCriteria: i.identifierOrCriteria.toString(),
      startAmount: i.startAmount.toString(),
      endAmount: i.endAmount.toString(),
    })),
    consideration: p.consideration.map((i) => ({
      itemType: i.itemType,
      token: i.token,
      identifierOrCriteria: i.identifierOrCriteria.toString(),
      startAmount: i.startAmount.toString(),
      endAmount: i.endAmount.toString(),
      recipient: i.recipient,
    })),
    orderType: p.orderType,
    startTime: p.startTime.toString(),
    endTime: p.endTime.toString(),
    zoneHash: p.zoneHash,
    salt: p.salt.toString(),
    conduitKey: p.conduitKey,
    totalOriginalConsiderationItems: p.totalOriginalConsiderationItems.toString(),
  };
}

/**
 * Every bigint back.
 *
 * This is the function a fill depends on. Seaport addresses an order by a hash
 * over all of these fields, so one value that does not come back byte-identical
 * makes the order unfillable — and it fails at the wallet, after the visitor
 * has already decided to buy.
 */
export function decodeParams(j: JsonOrderParameters): OrderParameters {
  return {
    offerer: j.offerer as Address,
    zone: j.zone as Address,
    offer: j.offer.map((i) => ({
      itemType: i.itemType,
      token: i.token as Address,
      identifierOrCriteria: BigInt(i.identifierOrCriteria),
      startAmount: BigInt(i.startAmount),
      endAmount: BigInt(i.endAmount),
    })),
    consideration: j.consideration.map((i) => ({
      itemType: i.itemType,
      token: i.token as Address,
      identifierOrCriteria: BigInt(i.identifierOrCriteria),
      startAmount: BigInt(i.startAmount),
      endAmount: BigInt(i.endAmount),
      recipient: i.recipient as Address,
    })),
    orderType: j.orderType,
    startTime: BigInt(j.startTime),
    endTime: BigInt(j.endTime),
    zoneHash: j.zoneHash as Hex,
    salt: BigInt(j.salt),
    conduitKey: j.conduitKey as Hex,
    totalOriginalConsiderationItems: BigInt(j.totalOriginalConsiderationItems),
  };
}

/**
 * The Merkle root an offer names, if it names one.
 *
 * Zero means "any token in the collection" and a non-zero value is a root the
 * app cannot currently resolve back into a token list. Both are worth keeping:
 * the column is what a trait-level offer would eventually be built on, and
 * throwing it away now would mean re-reading the chain to get it back.
 */
function criteriaOf(p: OrderParameters): string | null {
  const item = p.consideration.find(
    (i) =>
      i.itemType === ItemType.ERC721_WITH_CRITERIA ||
      i.itemType === ItemType.ERC1155_WITH_CRITERIA,
  );
  return item === undefined ? null : item.identifierOrCriteria.toString();
}

/**
 * One `OrderValidated` log as a row, or `undefined` for a shape the app does
 * not price.
 *
 * `undefined` is a decision, not a failure. A swap with no currency, a bundle,
 * a listing denominated in some other token — all valid Seaport orders, none of
 * them something this marketplace can show a price for, and indexing them as
 * though it could would be worse than leaving them out.
 *
 * Addresses are lower-cased on the way in. Postgres compares text exactly, and
 * the chain does not agree with itself about case: an event carries whatever
 * the caller encoded. Without this, `collection=eq.0xCD30…` matches some of a
 * collection's listings and silently misses the rest.
 */
export function orderRow(
  hash: Hex,
  params: OrderParameters,
  blockNumber: bigint,
  at: Date,
): OrderRow | undefined {
  const read = readOrder(params);
  if (read === undefined) return undefined;

  return {
    order_hash: hash.toLowerCase(),
    offerer: read.maker.toLowerCase(),
    side: read.kind,
    collection: read.collection.toLowerCase(),
    token_id: read.tokenId === undefined ? null : read.tokenId.toString(),
    criteria: criteriaOf(params),
    price_wei: read.priceWei.toString(),
    currency: read.currency.toLowerCase(),
    start_time: Number(params.startTime),
    end_time: Number(read.endTime),
    params: encodeParams(params),
    block_number: Number(blockNumber),
    updated_at: at.toISOString(),
  };
}

/**
 * Many `OrderValidated` logs as rows, keeping the LATEST validation of each.
 *
 * `validate()` is idempotent and a second call emits a second event, so the
 * same order arrives more than once. Which copy survives is not cosmetic: it
 * decides `block_number`, and `block_number` is what the counter rule compares
 * against. Keeping the earliest would hide any order that its maker voided and
 * then re-validated — live on chain, invisible on the site, with no way back
 * short of a new order hash. That exact bug has already been fixed once in
 * `useSeaportOrders`; this is the same rule, held in the same direction.
 */
export function orderRows(
  logs: ReadonlyArray<{ hash: Hex; params: OrderParameters; blockNumber: bigint }>,
  at: Date,
): OrderRow[] {
  const byHash = new Map<string, OrderRow>();

  for (const log of logs) {
    const row = orderRow(log.hash, log.params, log.blockNumber, at);
    if (row === undefined) continue;
    const existing = byHash.get(row.order_hash);
    if (existing !== undefined && existing.block_number >= row.block_number) continue;
    byHash.set(row.order_hash, row);
  }

  return [...byHash.values()];
}

/**
 * `CounterIncremented` logs as rows, keeping the highest block per offerer.
 *
 * An offerer can void everything more than once, and only the most recent one
 * bounds what is still live.
 */
export function counterRows(
  logs: ReadonlyArray<{ offerer: Address; blockNumber: bigint }>,
): CounterRow[] {
  const highest = new Map<string, number>();

  for (const log of logs) {
    const key = log.offerer.toLowerCase();
    const at = Number(log.blockNumber);
    if ((highest.get(key) ?? -1) < at) highest.set(key, at);
  }

  return [...highest].map(([offerer, voided_after_block]) => ({
    offerer,
    voided_after_block,
  }));
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * A log, as the `events` table holds it.
 *
 * Keyed by where it happened rather than what it says. A log cannot occur twice
 * at the same position in the same transaction, so re-reading a block range —
 * which every sync does, deliberately, to survive a reorg — costs nothing and
 * collides with nothing.
 */
export interface EventRow {
  tx_hash: string;
  log_index: number;
  kind: "fulfilled" | "validated" | "cancelled";
  order_hash: string | null;
  block_number: number;
  args: JsonEventArgs;
  /**
   * What to narrow by. Not what the row says.
   *
   * The meaning of an event is decided on the client, from `args`, by the same
   * `readOrder` and `readFulfilment` every other path uses. These columns only
   * decide which query a row comes back in — so a wrong one misfiles a row, and
   * cannot make it claim anything it does not claim.
   *
   * Null where the shape gives no answer: a collection-wide bid names no token,
   * and a fulfilment this app will not price names nothing at all.
   */
  collection: string | null;
  token_id: string | null;
  maker: string | null;
  taker: string | null;
}

/** The moved items as `OrderFulfilled` reports them: resolved, not requested. */
export interface JsonSpentItem {
  itemType: number;
  token: string;
  identifier: string;
  amount: string;
}

export interface JsonReceivedItem extends JsonSpentItem {
  recipient: string;
}

export type JsonEventArgs =
  | { orderHash: string; orderParameters: JsonOrderParameters }
  | {
      orderHash: string;
      offerer: string;
      recipient: string;
      offer: JsonSpentItem[];
      consideration: JsonReceivedItem[];
    }
  | { orderHash: string; offerer: string };

const spent = (i: { itemType: number; token: string; identifier: bigint; amount: bigint }) => ({
  itemType: i.itemType,
  token: i.token,
  identifier: i.identifier.toString(),
  amount: i.amount.toString(),
});

/**
 * One log as a row, or `undefined` when it is missing what identifies it.
 *
 * A log with no transaction hash or position cannot be stored without inventing
 * a key, and an invented key is how the same event ends up in the feed twice.
 * viem always supplies both for a mined log; this is the guard for the case
 * where it cannot.
 */
export function eventRow(
  kind: EventRow["kind"],
  log: {
    transactionHash?: string | null;
    logIndex?: number | null;
    blockNumber: bigint;
    args: Record<string, unknown>;
  },
  /**
   * Where a cancellation's piece is looked up.
   *
   * `OrderCancelled` carries only a hash. The token it freed lives in that
   * order's own `OrderValidated`, which may be months of blocks behind the one
   * being read — so the caller resolves it and passes the answer in, rather
   * than this reaching for a database.
   */
  resolve?: (orderHash: string) => { collection: string; tokenId: string | null } | undefined,
): EventRow | undefined {
  const tx = log.transactionHash;
  const index = log.logIndex;
  if (tx === undefined || tx === null || index === undefined || index === null) return undefined;

  const orderHash = typeof log.args.orderHash === "string" ? log.args.orderHash.toLowerCase() : null;

  let args: JsonEventArgs;
  let collection: string | null = null;
  let tokenId: string | null = null;
  let maker: string | null = null;
  let taker: string | null = null;

  if (kind === "validated") {
    const params = log.args.orderParameters as OrderParameters | undefined;
    if (params === undefined || orderHash === null) return undefined;
    args = { orderHash, orderParameters: encodeParams(params) };

    const read = readOrder(params);
    if (read !== undefined) {
      collection = read.collection.toLowerCase();
      tokenId = read.tokenId === undefined ? null : read.tokenId.toString();
      maker = read.maker.toLowerCase();
    }
  } else if (kind === "fulfilled") {
    if (orderHash === null) return undefined;
    const offer = (log.args.offer ?? []) as Array<Parameters<typeof spent>[0]>;
    const consideration = (log.args.consideration ?? []) as Array<
      Parameters<typeof spent>[0] & { recipient: string }
    >;
    args = {
      orderHash,
      offerer: String(log.args.offerer ?? ""),
      recipient: String(log.args.recipient ?? ""),
      offer: offer.map(spent),
      consideration: consideration.map((i) => ({ ...spent(i), recipient: i.recipient })),
    };

    /**
     * Read the same way the feed will read it.
     *
     * `readFulfilment` refuses a settlement currency this marketplace does not
     * recognise, and a refusal leaves every column null — so a wash trade in a
     * token the attacker minted does not merely display as nothing, it does not
     * come back from a collection's query at all.
     */
    const sale = readFulfilment(
      log.args.offerer as `0x${string}`,
      log.args.recipient as `0x${string}`,
      (log.args.offer ?? []) as readonly SpentItem[],
      (log.args.consideration ?? []) as readonly ReceivedItem[],
    );
    if (sale !== undefined) {
      collection = sale.collection.toLowerCase();
      tokenId = sale.tokenId.toString();
      maker = sale.seller.toLowerCase();
      taker = sale.buyer.toLowerCase();
    }
  } else {
    if (orderHash === null) return undefined;
    args = { orderHash, offerer: String(log.args.offerer ?? "") };
    maker = String(log.args.offerer ?? "").toLowerCase() || null;

    const was = resolve?.(orderHash);
    if (was !== undefined) {
      collection = was.collection.toLowerCase();
      tokenId = was.tokenId;
    }
  }

  return {
    tx_hash: tx.toLowerCase(),
    log_index: index,
    kind,
    order_hash: orderHash,
    block_number: Number(log.blockNumber),
    args,
    collection,
    token_id: tokenId,
    maker,
    taker,
  };
}

/** Many logs as rows, dropping the ones that cannot be keyed. */
export function eventRows(
  kind: EventRow["kind"],
  logs: ReadonlyArray<{
    transactionHash?: string | null;
    logIndex?: number | null;
    blockNumber: bigint;
    args: Record<string, unknown>;
  }>,
  resolve?: (orderHash: string) => { collection: string; tokenId: string | null } | undefined,
): EventRow[] {
  return logs.flatMap((log) => {
    const row = eventRow(kind, log, resolve);
    return row === undefined ? [] : [row];
  });
}
