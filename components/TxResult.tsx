"use client";

import { deployment } from "@/config/contracts";
import { explainTxError, isRejection } from "@/lib/txError";
import "./TxResult.css";

/**
 * What happened to the transaction you just signed.
 *
 * Every write on this site used to end in silence. The action fired, the wallet
 * closed, and the page said nothing until a background poll happened to notice
 * — up to twelve seconds later, with no indication anything was in flight. On a
 * site that moves money that reads as "it didn't work", and the reasonable
 * response is to press the button again.
 *
 * `MintPanel` already did this correctly and minting was the one flow nobody
 * complained about. This is that pattern, extracted so the other five can share
 * it rather than each growing its own.
 *
 * The explorer link matters more here than it would elsewhere: ValueChain's
 * explorer lags, and has been observed showing transactions as "Pending" that
 * were mined a day earlier. A hash the person can carry to any other tool is
 * the honest thing to hand them.
 */
export function TxResult({
  hash,
  confirming,
  success,
  error,
  successLabel,
}: {
  hash: `0x${string}` | undefined;
  confirming: boolean;
  success: boolean;
  error: Error | null;
  /** What happened, in the past tense: "Listed", "Bought", "Offer placed". */
  successLabel: string;
}) {
  if (error !== null) {
    /**
     * A rejection is a decision, not a failure, and must not be dressed up as
     * one. Everything else goes through `explainTxError`, which names the few
     * causes a person can act on and otherwise shows the real first line.
     */
    const rejected = isRejection(error.message);
    return (
      <p className={`txr ${rejected ? "txr-quiet" : "txr-bad"}`}>
        {explainTxError(error.message)}
      </p>
    );
  }

  if (confirming) {
    return (
      <p className="txr txr-wait">
        <span className="txr-spin" aria-hidden="true" />
        Waiting for the chain to confirm…
        {hash === undefined ? null : (
          <a href={`${deployment.explorer}/tx/${hash}`} target="_blank" rel="noreferrer noopener">
            Track it
          </a>
        )}
      </p>
    );
  }

  if (success) {
    return (
      <p className="txr txr-good">
        <strong>{successLabel}.</strong>
        {hash === undefined ? null : (
          <a href={`${deployment.explorer}/tx/${hash}`} target="_blank" rel="noreferrer noopener">
            View transaction
          </a>
        )}
      </p>
    );
  }

  return null;
}
