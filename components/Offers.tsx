"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import { useOffers } from "@/hooks/useOffers";
import { useTrade, useWsoso } from "@/hooks/useTrade";
import { formatSoso, shortAddress } from "@/lib/format";
import "./Offers.css";

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

function whenExpires(expiry: bigint): string {
  if (expiry === 0n) return "no expiry";
  const secs = Number(expiry) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "expired";
  const days = Math.floor(secs / 86_400);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(secs / 3600);
  return hours >= 1 ? `${hours}h left` : "under an hour";
}

/**
 * Offers on one token.
 *
 * The contract has had `makeOffer`, `acceptOffer` and `withdrawOffer` since it
 * was deployed, with expiry and slippage guards, and nothing in the app ever
 * called them. Until now an unlisted token was a dead end that said "only its
 * owner can list it" — which is true, and useless to someone who wants to buy it.
 *
 * Offers are denominated in WSOSO because the marketplace refuses native ones:
 * an allowance leaves the money in the bidder's wallet, so an offer can stand
 * indefinitely without the marketplace ever holding funds. That costs the bidder
 * a wrap and an approval the first time, which is what the ladder below walks
 * them through rather than failing at the last step.
 */
export function Offers({
  collection,
  tokenId,
  isOwner,
  onChange,
}: {
  collection: `0x${string}`;
  tokenId: bigint;
  isOwner: boolean;
  onChange: () => void;
}) {
  const { isConnected } = useAccount();
  const { offers, mine, refetch } = useOffers(collection, tokenId);
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

  const after = () => {
    onChange();
    void refetch();
    wsoso.refetch();
  };

  return (
    <div className="offers">
      <div className="offers-head">
        <p className="eyebrow">Offers</p>
        {offers.length > 0 ? (
          <span className="offers-count">
            {offers.length} live · best {formatSoso(offers[0]!.price)} WSOSO
          </span>
        ) : null}
      </div>

      {offers.length === 0 ? (
        <p className="offers-empty">No offers yet.</p>
      ) : (
        <ul className="offers-list">
          {offers.map((o) => (
            <li key={o.bidder} className={`offers-row${o.mine ? " is-mine" : ""}`}>
              <span className="offers-price mono">{formatSoso(o.price)} WSOSO</span>
              <span className="offers-who">
                {o.mine ? "You" : shortAddress(o.bidder, 4)}
                <span className="offers-when">{whenExpires(o.expiry)}</span>
              </span>

              {isOwner ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={trade.busy}
                  onClick={() => {
                    // The price seen is passed as the floor: a bidder can
                    // overwrite their own offer downward, and the contract
                    // reverts rather than settling at the lower number.
                    trade.acceptOffer(tokenId, o.bidder, o.price);
                    after();
                  }}
                >
                  Accept
                </button>
              ) : o.mine ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={trade.busy}
                  onClick={() => {
                    trade.withdrawOffer(tokenId);
                    after();
                  }}
                >
                  Withdraw
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner || !isConnected ? null : (
        <div className="offers-make">
          <p className="offers-make-title">{mine === undefined ? "Make an offer" : "Replace your offer"}</p>

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
            One step is shown at a time, in the order the chain requires: wrap,
            then allow, then offer. Showing all three at once invites the last
            one to be pressed first and fail in the wallet with a revert nobody
            can read.
          */}
          {wanted > 0n && wsoso.needsWrap ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={wsoso.busy}
              onClick={() => {
                wsoso.wrap(formatEther(wsoso.shortfall));
                after();
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
                wsoso.allow();
                after();
              }}
            >
              {wsoso.busy ? "Approving…" : "Allow the marketplace to use WSOSO"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={trade.busy || wanted <= 0n}
              onClick={() => {
                trade.makeOffer(tokenId, amount, expiryFor(days));
                after();
              }}
            >
              {trade.signing
                ? "Confirm in wallet…"
                : trade.confirming
                  ? "Placing…"
                  : mine === undefined
                    ? "Place offer"
                    : "Replace offer"}
            </button>
          )}

          <p className="offers-note">
            Your WSOSO stays in your wallet. It only moves if the owner accepts, and you
            can withdraw the offer at any time before that.
          </p>

          {wsoso.error !== null ? (
            <p className="token-error">{wsoso.error.message.slice(0, 160)}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
