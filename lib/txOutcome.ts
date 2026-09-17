/**
 * What a receipt actually says about a transaction.
 *
 * Kept as a pure function in `lib/` rather than inside the hook because
 * `vitest.config.mts` includes `lib/**` and `config/**` only — no test of any
 * hook or component can run in this project at all. Putting the decision here
 * is what makes the most consequential boolean in the app testable.
 *
 * The distinction it encodes: viem's `waitForTransactionReceipt` resolves for a
 * REVERTED transaction, so "a receipt arrived" and "the transaction worked" are
 * different facts. Every call site in this app conflated them, and the loser of
 * a race was shown a green success banner.
 */

/** Only the part of a receipt this decision needs. */
export interface ReceiptStatus {
  status?: "success" | "reverted";
}

export type TxOutcome = "pending" | "succeeded" | "reverted";

export function outcomeOf(mined: boolean, receipt: ReceiptStatus | undefined): TxOutcome {
  if (!mined || receipt === undefined) return "pending";
  // An unrecognised status is not success. Defaulting the other way is how a
  // reverted transaction came to be reported as a completed one.
  return receipt.status === "success" ? "succeeded" : "reverted";
}
