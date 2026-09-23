"use client";

import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { SEAPORT } from "@/config/seaport";
import { Steps } from "@/components/Steps";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import { useWsoso } from "@/hooks/useWsoso";
import { useOwnOfferExposure } from "@/hooks/useSeaportOrders";
import { useAccount } from "wagmi";
import { deployment } from "@/config/contracts";
import { TxResult } from "@/components/TxResult";
import { Select } from "@/components/Select";

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

  /**
   * Empty the box once the offer is on chain.
   *
   * Left there, the amount is no longer a record of what was offered — it is
   * read as a *second* offer being prepared. And because the first one is now
   * standing, `useOwnOfferExposure` counts it, so the allowance this imaginary
   * second offer needs is the typed amount plus the one just committed, which
   * is more than was approved. `needsAllowance` flips back to true and the
   * whole ladder returns.
   *
   * The result was "Offer placed" and "Wrap → Allow → Offer" on screen
   * together: a receipt for something the form was simultaneously insisting
   * had not been done. Clearing it leaves the receipt alone and the form ready
   * for another offer, which is what the ladder reappearing was clumsily
   * trying to say.
   */
  useEffect(() => {
    if (step === "offer" && target.isSuccess) setAmount("");
  }, [step, target.isSuccess]);

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

        <div className="offers-expiry">
          <span className="offers-label">Expires</span>
          <Select
            label="Expires"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={WINDOWS.map((w) => ({ value: String(w.days), label: w.label }))}
          />
        </div>
      </div>

      {/*
        The balance, and what is already spoken for.

        "You hold 12.00001 WSOSO" beside an amount box reading 3 was read as
        this offer being twelve — reported from the live site on a fourth bid
        of 3. The figure is right and was doing nothing to explain itself: with
        bids standing, most of a bidder's balance is committed to them, because
        every standing bid needs its own money at the same time.

        So the sentence names the part that is committed. A bidder with no
        standing bids sees the short version, unchanged.
      */}
      <p className="offers-balance">
        You hold <b className="mono">{formatEther(wsoso.balance)}</b> WSOSO
        {standing > 0n ? (
          <>
            {" — "}
            <b className="mono">{formatEther(standing)}</b> of it is committed to offers
            you already have standing
          </>
        ) : null}
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
        <Steps
          label="Steps to place this offer"
          steps={[
            { label: "Wrap", state: wsoso.needsWrap ? "now" : "done" },
            { label: "Allow", state: wsoso.needsWrap ? "next" : "now" },
            /*
              Never "now" here. This whole block is hidden once neither the
              wrap nor the allowance is outstanding, so by the time the offer
              itself is the live rung there is one button and nothing to track.
            */
            { label: "Offer", state: "next" },
          ]}
        />
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
          {wsoso.busy ? "Approving…" : `Allow ${formatEther(wsoso.allowanceNeeded)} WSOSO`}
        </button>
      ) : null}

      {/*
        Why the button says a bigger number than the amount box.

        The allowance has to cover every bid at once — approving only the one
        being placed would revoke the cover for the ones already on chain — so
        on a fourth offer of 3 the button reads 12. Without this line that is
        indistinguishable from the form having got the amount wrong, and the
        obvious reading is that it is about to offer four times what was typed.

        Shown for the allowance step only. There is nothing to reconcile on the
        first bid, and the wrap button already names the difference it is
        making rather than a total.
      */}
      {wanted > 0n && !wsoso.needsWrap && wsoso.needsAllowance && standing > 0n ? (
        <p className="offers-note">
          That total is this <b className="mono">{formatEther(wanted)}</b> WSOSO offer plus
          the <b className="mono">{formatEther(standing)}</b> already committed to your
          standing offers — not the size of this one. Approving less would leave those
          uncovered.
        </p>
      ) : null}

      {wanted > 0n && (wsoso.needsWrap || wsoso.needsAllowance) ? null : (
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
