"use client";

import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useTrade, useWsoso } from "@/hooks/useTrade";
import { TxResult } from "@/components/TxResult";

/** Expiry choices, in days. Zero is the contract's "no expiry". */
const WINDOWS = [
  { label: "1 day", days: 1 },
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "No expiry", days: 0 },
];

function expiryFor(days: number): bigint {
  if (days === 0) return 0n;
  return BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
}

/**
 * Placing an offer: the amount, the deadline, and the steps the chain requires
 * before either can be used.
 *
 * Lifted out of `Offers` so the token page and the dialog opened from a card
 * run the same code. Two implementations of a form that spends money is two
 * places for the wrap/allow ordering to drift apart.
 */
export function OfferForm({
  collection,
  tokenId,
  replacing,
  onDone,
}: {
  collection: `0x${string}`;
  tokenId: bigint;
  /** True when the connected wallet already has a standing offer here. */
  replacing: boolean;
  onDone: () => void;
}) {
  const trade = useTrade(collection);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState(7);

  const wanted = (() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  })();

  const wsoso = useWsoso(wanted);

  // On the receipt, never on the click — see the note in TokenView.
  useEffect(() => {
    if (trade.isSuccess || wsoso.isSuccess) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash, wsoso.isSuccess]);

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
          {wsoso.busy ? "Approving…" : "Allow the marketplace to use WSOSO"}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={trade.busy || wanted <= 0n}
          onClick={() => trade.makeOffer(tokenId, amount, expiryFor(days))}
        >
          {trade.signing
            ? "Confirm in wallet…"
            : trade.confirming
              ? "Placing…"
              : replacing
                ? "Replace offer"
                : "Place offer"}
        </button>
      )}

      <p className="offers-note">
        Your WSOSO stays in your wallet. It only moves if the owner accepts, and you can
        withdraw the offer at any time before that.
      </p>

      <TxResult
        hash={wsoso.busy || wsoso.isSuccess ? undefined : trade.hash}
        confirming={trade.confirming || wsoso.confirming}
        success={trade.isSuccess || wsoso.isSuccess}
        error={trade.error ?? wsoso.error}
        successLabel={wsoso.isSuccess ? "Done" : "Offer placed"}
      />
    </div>
  );
}
