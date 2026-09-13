"use client";

import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { deployment } from "@/config/contracts";
import { useTrade, useWsoso } from "@/hooks/useTrade";
import { COLLECTION_OFFERS_ADDRESS } from "@/hooks/useCollectionOffers";
import { useCollectionOfferTrade } from "@/hooks/useCollectionOfferTrade";
import { TxResult } from "@/components/TxResult";

/**
 * Expiry choices. Every one of them is bounded, deliberately.
 *
 * The contract accepts `expiry == 0` for "never", and this offered it. Combined
 * with the unlimited WSOSO allowance a bidder grants once, that means an offer
 * made months ago on a token that has since collapsed can still be filled at the
 * old price, with no further action from the bidder — and offers are keyed by
 * `(collection, tokenId, bidder)` with no binding to the current owner, so
 * whoever holds the token later can take it.
 *
 * `withdrawOffer` exists, but relying on someone to remember an open commitment
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

  const wanted = (() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  })();

  const wsoso = useWsoso(wanted, target.spender);

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

      {/*
        One step at a time, in the order the chain requires: wrap, then allow,
        then offer. Showing all three at once invites the last to be pressed
        first and fail in the wallet with a revert nobody can read.
      */}
      {wanted > 0n && wsoso.needsWrap ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={wsoso.busy}
          onClick={() => wsoso.wrap(formatEther(wsoso.shortfall))}
        >
          {wsoso.busy ? "Wrapping…" : `Wrap ${formatEther(wsoso.shortfall)} SOSO first`}
        </button>
      ) : wanted > 0n && wsoso.needsAllowance ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={wsoso.busy}
          onClick={() => wsoso.allow()}
        >
          {wsoso.busy ? "Approving…" : "Allow WSOSO to be spent on this offer"}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={target.busy || wanted <= 0n}
          onClick={() => target.place(amount, days)}
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
        hash={wsoso.busy || wsoso.isSuccess ? undefined : target.hash}
        confirming={target.confirming || wsoso.confirming}
        success={target.isSuccess || wsoso.isSuccess}
        error={target.error ?? wsoso.error}
        successLabel={wsoso.isSuccess ? "Done" : "Offer placed"}
      />
    </div>
  );
}

/**
 * An offer on one piece, spent by the marketplace.
 *
 * A hook rather than a plain object because it owns its own `useTrade` — the
 * form's transaction state has to be separate from the panel around it, or
 * placing an offer would report its result in the Accept row's slot.
 */
export function useTokenOfferTarget(collection: `0x${string}`, tokenId: bigint): OfferTarget {
  const trade = useTrade(collection);

  return {
    spender: deployment.marketplace,
    buying: "this piece",
    place: (amount, days) =>
      trade.makeOffer(tokenId, amount, BigInt(Math.floor(Date.now() / 1000) + days * 86_400)),
    signing: trade.signing,
    confirming: trade.confirming,
    busy: trade.busy,
    isSuccess: trade.isSuccess,
    error: trade.error,
    hash: trade.hash,
  };
}

/** An offer on any piece in a collection, spent by the offers contract. */
export function useCollectionOfferTarget(collection: `0x${string}`): OfferTarget {
  const trade = useCollectionOfferTrade(collection);

  return {
    spender: COLLECTION_OFFERS_ADDRESS as `0x${string}`,
    buying: "any piece in this collection",
    place: (amount, days) => trade.makeOffer(amount, days),
    signing: trade.signing,
    confirming: trade.confirming,
    busy: trade.busy,
    isSuccess: trade.isSuccess,
    error: trade.error,
    hash: trade.hash,
  };
}
