"use client";

import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { SEAPORT } from "@/config/seaport";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import { useWsoso } from "@/hooks/useWsoso";
import { useOwnOfferExposure } from "@/hooks/useSeaportOrders";
import { useAccount } from "wagmi";
import { deployment } from "@/config/contracts";
import { TxResult } from "@/components/TxResult";

/**
 * Expiry choices. Every one of them is bounded, deliberately.
 *
 * Seaport will happily take `endTime` far in the future, and this form used to
 * offer "never". Combined with the unlimited WSOSO allowance a bidder grants
 * once, that means an offer made months ago on a token that has since collapsed
 * is still standing at the old price, fillable by whoever holds the token then,
 * with no further action from the bidder.
 *
 * Cancelling exists — one order, or all of them at once through
 * `incrementCounter` — but relying on someone to remember an open commitment
 * indefinitely is not a control. Three months is the longest anyone can leave
 * one standing from here.
 */
const WINDOWS = [
  { label: "1 day", days: 1 },
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
];

/**
 * What this form is placing an offer against.
 *
 * There are two kinds now — an offer on one piece, spent by the marketplace, and
 * an offer on a whole collection, spent by the offers contract — and they share
 * nothing but the money. The part that must not be duplicated is the ladder
 * below: wrap, then allow, then offer, strictly in that order. Two copies of
 * that sequence is two places for it to drift, and the failure mode is a wallet
 * revert nobody can read.
 *
 * So the form owns the ladder and the caller supplies the destination. The
 * `spender` in particular has to come from the caller: an allowance granted to
 * the marketplace does nothing for the offers contract, and reading the wrong
 * one reports "approved" when nothing is.
 */
export interface OfferTarget {
  /** The contract that will be allowed to spend the WSOSO. */
  spender: `0x${string}`;
  /** What the bidder is buying, in words: "this piece", "any piece". */
  buying: string;
  place: (amount: string, days: number) => void;
  signing: boolean;
  confirming: boolean;
  busy: boolean;
  isSuccess: boolean;
  error: Error | null;
  hash: `0x${string}` | undefined;
}

/**
 * Placing an offer: the amount, the deadline, and the steps the chain requires
 * before either can be used.
 *
 * Lifted out of `Offers` so the token page, the dialog a card opens, and the
 * collection page all run the same code.
 */
export function OfferForm({
  target,
  replacing,
  onDone,
}: {
  target: OfferTarget;
  /** True when the connected wallet already has a standing offer here. */
  replacing: boolean;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState(7);

  /**
   * Which rung of the ladder was last pressed.
   *
   * The result banner used to read `successLabel={wsoso.isSuccess ? "Done" :
   * "Offer placed"}`, and `wsoso.isSuccess` stays true for the life of the
   * component — so once a bidder had wrapped, actually placing the offer still
   * reported "Done" and dropped the transaction link. A receipt only means
   * something next to the button that produced it.
   */
  const [step, setStep] = useState<"wrap" | "allow" | "offer" | undefined>(undefined);

  const wanted = (() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  })();

  /**
   * Allowances are exact now, so approving for this bid alone would revoke the
   * cover for bids already on chain. Ask for both.
   */
  const { address } = useAccount();
  const standing = useOwnOfferExposure(address, deployment.wsoso as `0x${string}`);
  const wsoso = useWsoso(wanted, target.spender, standing);

  // On the receipt, never on the click — see the note in TokenView.
  useEffect(() => {
    if (target.isSuccess || wsoso.isSuccess) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.isSuccess, target.hash, wsoso.isSuccess]);

  return (
    <div className="offers-make">
      <div className="offers-fields">
        <label className="offers-amount">
          <span className="offers-label">Amount</span>
          <div className="field-suffix">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            <span>WSOSO</span>
          </div>
        </label>

        <label className="offers-expiry">
          <span className="offers-label">Expires</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.label} value={w.days}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="offers-balance">
        You hold <b className="mono">{formatEther(wsoso.balance)}</b> WSOSO
      </p>

      {/**
       * One step at a time, in the order the chain requires: wrap, then allow,
       * then offer. Showing all three at once invites the last to be pressed
       * first and fail in the wallet with a revert nobody can read.
       *
       * But one button at a time also hides how many are coming, and somebody
       * who expected to sign once and is asked three times reasonably assumes
       * something went wrong. So the rungs still needed are listed above it.
       */}
      {wanted > 0n && (wsoso.needsWrap || wsoso.needsAllowance) ? (
        <ol className="token-steps" aria-label="Steps to place this offer">
          <li className={wsoso.needsWrap ? "is-now" : "is-done"}>
            <span className="token-step-n" aria-hidden="true">
              {wsoso.needsWrap ? "1" : "✓"}
            </span>
            Wrap
          </li>
          <li className={wsoso.needsWrap ? "" : "is-now"}>
            <span className="token-step-n" aria-hidden="true">
              2
            </span>
            Allow
          </li>
          <li>
            <span className="token-step-n" aria-hidden="true">
              3
            </span>
            Offer
          </li>
        </ol>
      ) : null}

      {wanted > 0n && wsoso.needsWrap ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={wsoso.busy}
          onClick={() => {
            setStep("wrap");
            wsoso.wrap(formatEther(wsoso.shortfall));
          }}
        >
          {wsoso.busy ? "Wrapping…" : `Wrap ${formatEther(wsoso.shortfall)} SOSO first`}
        </button>
      ) : wanted > 0n && wsoso.needsAllowance ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={wsoso.busy}
          onClick={() => {
            setStep("allow");
            wsoso.allow();
          }}
        >
          {wsoso.busy ? "Approving…" : `Allow exactly ${formatEther(wsoso.allowanceNeeded)} WSOSO`}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={target.busy || wanted <= 0n}
          onClick={() => {
            setStep("offer");
            /**
             * Clear the wrap/allow receipt before the last step, or its success
             * lingers next to this one's and the banner reports the wrong thing.
             */
            wsoso.reset();
            target.place(amount, days);
          }}
        >
          {target.signing
            ? "Confirm in wallet…"
            : target.confirming
              ? "Placing…"
              : replacing
                ? "Replace offer"
                : "Place offer"}
        </button>
      )}

      <p className="offers-note">
        Your WSOSO stays in your wallet. It only moves if a holder of {target.buying} accepts, and
        you can withdraw the offer at any time before that.
      </p>

      <TxResult
        /* Whichever rung is actually in flight owns the banner. */
        hash={step === "offer" ? target.hash : wsoso.hash}
        confirming={target.confirming || wsoso.confirming}
        success={step === "offer" ? target.isSuccess : wsoso.isSuccess}
        error={target.error ?? wsoso.error}
        successLabel={
          step === "wrap"
            ? "Wrapped — now allow it to be spent"
            : step === "allow"
              ? "Allowed — now place your offer"
              : "Offer placed"
        }
      />
    </div>
  );
}

/**
 * An offer on one piece.
 *
 * A hook rather than a plain object because it owns its own write state — the
 * form's transaction has to be separate from the panel around it, or placing an
 * offer would report its result in the Accept row's slot.
 */
export function useTokenOfferTarget(collection: `0x${string}`, tokenId: bigint): OfferTarget {
  const trade = useSeaportTrade(collection);

  return {
    spender: SEAPORT,
    buying: "this piece",
    place: (amount, days) => trade.makeOffer(tokenId, amount, days),
    signing: trade.signing,
    confirming: trade.confirming,
    busy: trade.busy,
    isSuccess: trade.isSuccess,
    error: trade.error,
    hash: trade.hash,
  };
}

/**
 * An offer on any piece in a collection.
 *
 * The same form, the same contract, the same allowance — the only difference is
 * that the order names no token id, so Seaport treats it as a criteria item
 * matching anything in the contract. That is the whole fix for the original
 * complaint: an offer on one SoDex Larper that five holders of other Larpers
 * could see but not accept.
 *
 * This used to need a second contract of our own, with its own deployment, its
 * own audit surface and its own allowance for a bidder to get wrong. It is now
 * a field left blank.
 */
export function useCollectionOfferTarget(collection: `0x${string}`): OfferTarget {
  const trade = useSeaportTrade(collection);

  return {
    spender: SEAPORT,
    buying: "any piece in this collection",
    place: (amount, days) => trade.makeOffer(undefined, amount, days),
    signing: trade.signing,
    confirming: trade.confirming,
    busy: trade.busy,
    isSuccess: trade.isSuccess,
    error: trade.error,
    hash: trade.hash,
  };
}
