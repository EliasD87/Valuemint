"use client";

import { useWaitForTransactionReceipt } from "wagmi";
import { outcomeOf } from "@/lib/txOutcome";

/**
 * Did the transaction actually do anything?
 *
 * `useWaitForTransactionReceipt().isSuccess` does not mean what every call site
 * in this app assumed it meant. It means **a receipt was fetched**. viem's
 * `waitForTransactionReceipt` resolves for a reverted transaction — it rejects
 * only on timeout, replacement or not-found — and wagmi wraps that in a query,
 * so `isSuccess` is "the query succeeded", not "the transaction succeeded".
 *
 * The receipt has carried the answer all along, in `status: "success" |
 * "reverted"`, and nothing in the app read it. The consequence was that the
 * loser of every race was told they had won: two buyers click Buy, the second
 * reverts with Seaport's `OrderAlreadyFilled`, the wallet lets them push past
 * its warning, they pay gas, receive nothing — and the page renders a green
 * **Bought.** with a link to the failed transaction. The same path printed
 * "Sold.", "Listed." and "Offer placed." over reverts, and fired the
 * receipt-driven refetches, so the UI settled confidently into a state the
 * person reads as confirmation.
 *
 * This is a drop-in replacement: it returns everything the wagmi hook returns,
 * with `isSuccess` narrowed to mean mined **and** succeeded, and a revert
 * surfaced through `error` so the existing `TxResult` shows it as a failure
 * rather than silently.
 */

/** The message `TxResult` renders when a transaction was mined but reverted. */
export const REVERTED_MESSAGE =
  "The transaction was mined but reverted, so nothing changed. You still paid gas. " +
  "This usually means someone else got there first, or the order is no longer available.";

export class TransactionRevertedError extends Error {
  constructor() {
    super(REVERTED_MESSAGE);
    this.name = "TransactionRevertedError";
  }
}

export function useTxOutcome(args: { hash: `0x${string}` | undefined }) {
  const result = useWaitForTransactionReceipt(args);

  const outcome = outcomeOf(result.isSuccess, result.data);
  const reverted = outcome === "reverted";

  return {
    ...result,
    /**
     * Mined AND succeeded. Every caller that previously read `isSuccess` gets
     * the meaning it always assumed, so no call site had to change shape — the
     * point of keeping this signature identical.
     */
    isSuccess: outcome === "succeeded",
    /** Mined and reverted. Distinct from "still confirming" and from "failed to send". */
    reverted,
    error: result.error ?? (reverted ? new TransactionRevertedError() : null),
  };
}
