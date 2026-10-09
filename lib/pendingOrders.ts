"use client";

import { decodeEventLog, parseAbiItem, type Hex, type TransactionReceipt } from "viem";
import { SEAPORT } from "@/config/seaport";
import { readOrder, type OrderParameters, type ReadOrder } from "@/lib/seaport";

/**
 * Orders this browser has just placed, held until the order book catches up.
 *
 * The book is rebuilt from `OrderValidated` logs, and that scan is deliberately
 * behind the chain in two ways: it stops `CONFIRMATIONS = 6` blocks short of the
 * head, and it polls every thirty seconds. On ValueChain's ~2s blocks that is
 * about twelve seconds of deliberate lag plus up to thirty of poll — so for the
 * better part of a minute after a successful offer, the transaction has been
 * mined, the money is committed, and the app shows nothing. The only thing that
 * appeared to help was reloading, which merely started a fresh scan after
 * enough time had passed.
 *
 * Neither number is wrong. Six confirmations is what stops a re-org showing an
 * order that no longer exists, and thirty seconds is what keeps a marketplace
 * of this size off its own RPC. What was missing is that the browser placing
 * the order does not need to be told about it — it built the thing.
 *
 * So the order is taken from the receipt of the transaction that placed it, and
 * held here until the scan reports the same hash. Three properties matter:
 *
 *   - it is the REAL order, decoded from the `OrderValidated` log Seaport
 *     emitted, not a guess assembled from the form. What is shown is exactly
 *     what the scan will show;
 *   - it passes `readOrder`, the same whitelist every other order goes through,
 *     so nothing skips the safety gate by arriving this way;
 *   - it expires. An order that the scan never reports — a re-org, a chain
 *     that rewound — disappears on its own rather than being believed forever.
 */

/** Seaport 1.6's event. Its ABI is fixed by a deployed contract and cannot drift. */
const ORDER_VALIDATED = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

export interface PendingOrder {
  hash: Hex;
  params: OrderParameters;
  blockNumber: bigint;
  read: ReadOrder;
  /** When it was placed, so a stuck one can be given up on. */
  at: number;
}

/**
 * Long enough to cover the scan's lag several times over, short enough that a
 * re-orged order does not linger. The scan normally reports within a minute.
 */
const TTL_MS = 10 * 60_000;

const orders = new Map<string, PendingOrder>();
const listeners = new Set<() => void>();

/**
 * A stable snapshot.
 *
 * `useSyncExternalStore` compares by identity and re-reads on every render, so
 * handing it a fresh array each time is an infinite loop. This is rebuilt only
 * when the map actually changes.
 *
 * `EMPTY` is shared rather than written as `[]` at each use, and that is the
 * whole point of it existing: a literal is a new array every time it is
 * evaluated, so a function ending `return []` fails the identity check on every
 * single call. React says so outright — "The result of getServerSnapshot should
 * be cached to avoid an infinite loop" — and it was the server snapshot below
 * that did it.
 */
const EMPTY: PendingOrder[] = [];

let snapshot: PendingOrder[] = EMPTY;

function publish(): void {
  const now = Date.now();
  for (const [hash, order] of orders) {
    if (now - order.at > TTL_MS) orders.delete(hash);
  }
  /** Back to the shared empty array, so an emptied store is stable too. */
  snapshot = orders.size === 0 ? EMPTY : [...orders.values()];
  for (const listener of listeners) listener();
}

export function subscribePendingOrders(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingOrdersSnapshot(): PendingOrder[] {
  return snapshot;
}

/**
 * The server renders none of these; they only exist in the tab that made them.
 *
 * Returns the shared `EMPTY` rather than a literal. `return []` here is a new
 * array on every call, which is exactly the identity churn `useSyncExternalStore`
 * refuses.
 */
export function pendingOrdersServerSnapshot(): PendingOrder[] {
  return EMPTY;
}

/**
 * Take every order this receipt validated and hold on to it.
 *
 * A receipt can carry more than one — bulk listing validates up to fifty in a
 * single transaction — so every matching log is read, not just the first.
 */
export function rememberValidatedOrders(receipt: TransactionReceipt | undefined): void {
  if (receipt === undefined) return;

  let added = false;

  for (const log of receipt.logs) {
    /** Seaport's own logs only. A receipt also carries the collection's Approval. */
    if (log.address.toLowerCase() !== SEAPORT.toLowerCase()) continue;

    let decoded;
    try {
      decoded = decodeEventLog({
        abi: [ORDER_VALIDATED],
        data: log.data,
        topics: log.topics,
      });
    } catch {
      /** Some other Seaport event — a fill, a cancellation. Not ours to hold. */
      continue;
    }

    const args = decoded.args as unknown as {
      orderHash: Hex;
      orderParameters: OrderParameters;
    };
    if (args?.orderHash === undefined || args.orderParameters === undefined) continue;

    /**
     * The same gate every other order passes. An order that `readOrder` refuses
     * is one this app would never display from the scan either, and arriving by
     * this door must not change that.
     */
    const read = readOrder(args.orderParameters);
    if (read === undefined) continue;

    orders.set(args.orderHash.toLowerCase(), {
      hash: args.orderHash,
      params: args.orderParameters,
      blockNumber: receipt.blockNumber,
      read,
      at: Date.now(),
    });
    added = true;
  }

  if (added) publish();
}

/**
 * Drop the ones the scan has now reported.
 *
 * Called with every hash the order book knows about. Once it has an order,
 * holding a second copy here can only cause the two to disagree — about its
 * status, or about whether it is still fillable.
 */
export function forgetSeenOrders(hashes: Iterable<string>): void {
  if (orders.size === 0) return;

  let removed = false;
  for (const hash of hashes) {
    if (orders.delete(hash.toLowerCase())) removed = true;
  }
  if (removed) publish();
}

/* ------------------------------------------------------------------------- *
 * Withdrawals, the other direction (2026-10-09).
 *
 * The same lag hid the opposite change: an offer withdrawn and confirmed stayed
 * on screen, with its Withdraw button, until the index noticed or the next
 * status read came round, and the only thing that seemed to help was reloading.
 * So the receipt of a `cancel` (or `incrementCounter`) is read the same way and
 * the book stops showing those orders at once.
 *
 * A cancellation is final in Seaport, so nothing here has to be taken back.
 * The TTL only bounds memory: well before it runs out, the chain's own status
 * read and the index both say the same thing.
 * ------------------------------------------------------------------------- */

const ORDER_CANCELLED = parseAbiItem(
  "event OrderCancelled(bytes32 orderHash, address indexed offerer, address indexed zone)",
);
const COUNTER_INCREMENTED = parseAbiItem("event CounterIncremented(uint256 newCounter, address indexed offerer)");

export interface Withdrawn {
  /** Order hashes cancelled one by one, lower-cased. */
  hashes: ReadonlySet<string>;
  /** Makers who voided everything, and the block they did it in: orders up to it are gone. */
  voidedAfter: ReadonlyMap<string, bigint>;
}

const NOTHING_WITHDRAWN: Withdrawn = { hashes: new Set(), voidedAfter: new Map() };

const cancelled = new Map<string, number>();
const voided = new Map<string, { block: bigint; at: number }>();
let withdrawnSnap: Withdrawn = NOTHING_WITHDRAWN;
const withdrawnListeners = new Set<() => void>();

function publishWithdrawn(): void {
  const now = Date.now();
  for (const [hash, at] of cancelled) if (now - at > TTL_MS) cancelled.delete(hash);
  for (const [maker, v] of voided) if (now - v.at > TTL_MS) voided.delete(maker);
  withdrawnSnap =
    cancelled.size === 0 && voided.size === 0
      ? NOTHING_WITHDRAWN
      : {
          hashes: new Set(cancelled.keys()),
          voidedAfter: new Map([...voided].map(([maker, v]) => [maker, v.block])),
        };
  for (const listener of withdrawnListeners) listener();
}

export function subscribeWithdrawn(listener: () => void): () => void {
  withdrawnListeners.add(listener);
  return () => withdrawnListeners.delete(listener);
}

export function withdrawnSnapshot(): Withdrawn {
  return withdrawnSnap;
}

export function withdrawnServerSnapshot(): Withdrawn {
  return NOTHING_WITHDRAWN;
}

/**
 * Take every cancellation this receipt carries and stop showing those orders.
 *
 * Read from Seaport's own `OrderCancelled` and `CounterIncremented` logs, so
 * only what the chain actually did is acted on: a reverted transaction has no
 * logs, and a receipt from anything else has none of Seaport's.
 */
export function rememberWithdrawals(receipt: TransactionReceipt | undefined): void {
  if (receipt === undefined || receipt.status !== "success") return;

  let changed = false;
  const now = Date.now();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== SEAPORT.toLowerCase()) continue;
    try {
      const { args } = decodeEventLog({ abi: [ORDER_CANCELLED], data: log.data, topics: log.topics });
      cancelled.set((args.orderHash as Hex).toLowerCase(), now);
      changed = true;
      continue;
    } catch {
      /* Not a cancellation. */
    }
    try {
      const { args } = decodeEventLog({ abi: [COUNTER_INCREMENTED], data: log.data, topics: log.topics });
      voided.set((args.offerer as string).toLowerCase(), { block: receipt.blockNumber, at: now });
      changed = true;
    } catch {
      /* Some other Seaport event. */
    }
  }

  if (changed) publishWithdrawn();
}
