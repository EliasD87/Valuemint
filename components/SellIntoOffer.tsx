"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { erc20Abi, type Hex } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { SEAPORT } from "@/config/seaport";
import { deployment } from "@/config/contracts";
import { fetchTokenCriteria, rootKey } from "@/hooks/useCriteria";
import { useOwnOfferExposure, type SeaportOrder } from "@/hooks/useSeaportOrders";
import { useSeaportFill, useSeaportTrade } from "@/hooks/useSeaportTrade";
import { useCanPayFeeInWsoso } from "@/hooks/useWsoso";
import { FillBlocked } from "@/components/FillBlocked";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import { AddressLink } from "@/components/AddressLink";
import { formatSoso } from "@/lib/format";
import { currencyLabel, fulfillerOutlay, remainingPieces } from "@/lib/seaport";
import "./OfferDialog.css";
import "./SellIntoOffer.css";

/**
 * Sell several pieces into one batch offer, in one transaction (2026-10-03).
 *
 * A batch offer asks for N pieces at a price each. One fill per piece would be
 * N confirmations; `acceptOfferMany` sends them as one — the order repeated
 * once per piece, settled in contracts/test/SeaportBatchOrders.test.ts.
 *
 * **How many is the smallest of four things**, and every one of them is a way
 * the transaction would otherwise fail or overreach:
 *   - what the offer still wants
 *   - what the viewer holds that qualifies
 *   - what the bidder can actually pay for right now, from their balance AND
 *     their allowance — a batch offer is only as good as the money behind it,
 *     and a sale the bidder cannot cover reverts the whole transaction
 *   - 50, the ceiling one transaction carries comfortably
 *
 * Pieces of one level are interchangeable, so the dialog takes the count and
 * picks the pieces, lowest ids first, and lists exactly which before anything
 * is signed.
 */
const PER_TRANSACTION = 50;

export function SellIntoOffer({
  collection,
  offer,
  eligible,
  bounds,
  label,
  onClose,
}: {
  collection: `0x${string}`;
  offer: SeaportOrder;
  /** The viewer's pieces this offer can take. */
  eligible: readonly bigint[];
  /** The snapshots trait sets were offered at, for the proofs. */
  bounds: readonly bigint[];
  /** What the offer is for, in words: "Any piece", "Level: Common". */
  label: string;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const trade = useSeaportTrade(collection);
  const fill = useSeaportFill();
  const ownBids = useOwnOfferExposure(address, deployment.wsoso as `0x${string}`);

  /** The bidder's money, read now: balance and what Seaport may take of it. */
  const { data: bidder } = useReadContracts({
    contracts: [
      { address: offer.currency, abi: erc20Abi, functionName: "balanceOf", args: [offer.maker] },
      { address: offer.currency, abi: erc20Abi, functionName: "allowance", args: [offer.maker, SEAPORT] },
    ],
    query: { refetchInterval: 15_000 },
  });
  const funded = useMemo(() => {
    const balance = bidder?.[0]?.status === "success" ? (bidder[0].result as bigint) : undefined;
    const allowance = bidder?.[1]?.status === "success" ? (bidder[1].result as bigint) : undefined;
    if (balance === undefined || allowance === undefined || offer.priceWei === 0n) return undefined;
    const cover = balance < allowance ? balance : allowance;
    return Number(cover / offer.priceWei);
  }, [bidder, offer.priceWei]);

  const wanted = Number(remainingPieces(offer));
  const sorted = useMemo(() => [...eligible].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), [eligible]);
  const max = Math.max(0, Math.min(wanted, sorted.length, funded ?? 0, PER_TRANSACTION));

  const [count, setCount] = useState("");
  const n = (() => {
    const typed = Number.parseInt(count, 10);
    if (count.trim() === "" || !Number.isFinite(typed)) return max;
    return Math.max(0, Math.min(typed, max));
  })();
  const pieces = sorted.slice(0, n);

  const nb = BigInt(n);
  const fee = fulfillerOutlay(offer.params, nb);
  const gross = offer.priceWei * nb;
  const feeAllowance = useCanPayFeeInWsoso(fee, ownBids);

  const trait = offer.criteria !== undefined && offer.criteria !== 0n;
  const [proving, setProving] = useState(false);
  const [proofError, setProofError] = useState<Error | null>(null);

  useEffect(() => {
    if (trade.isSuccess || feeAllowance.isSuccess) {
      void trade.refetchApproval();
      feeAllowance.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash, feeAllowance.isSuccess]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  /**
   * Each piece's proof against the offer's set, fetched only when selling.
   * A piece the site cannot prove is in the set is not sent: Seaport would
   * refuse it and take the rest of the transaction down with it.
   */
  const sell = async () => {
    setProofError(null);
    if (!trait) {
      fill.acceptOfferMany(offer, pieces.map((tokenId) => ({ tokenId })));
      return;
    }
    setProving(true);
    try {
      const key = rootKey(offer.criteria!);
      const proved = await Promise.all(
        pieces.map(async (tokenId) => {
          const memberships = await fetchTokenCriteria(collection, tokenId, bounds);
          const m = memberships.find((x) => rootKey(x.root) === key);
          if (m === undefined) throw new Error(`#${tokenId.toString()} is not in this offer's set.`);
          return { tokenId, proof: m.proof as readonly Hex[] };
        }),
      );
      fill.acceptOfferMany(offer, proved);
    } catch (e) {
      setProofError(e instanceof Error ? e : new Error("Could not check your pieces just now."));
    } finally {
      setProving(false);
    }
  };

  if (!mounted) return null;

  const mustApprove = trade.needsApproval;
  const mustAllowFee = !mustApprove && feeAllowance.needsAllowance;
  const busy = trade.busy || fill.busy || feeAllowance.busy || proving;
  const done = fill.isSuccess;

  return createPortal(
    <>
      <div className="od-scrim" onClick={onClose} aria-hidden="true" />
      <div className="od" role="dialog" aria-modal="true" aria-label="Sell into this offer">
        <div className="od-head">
          <div>
            <p className="od-kicker">Sell into an offer</p>
            <h2>{label}</h2>
          </div>
          <button type="button" className="od-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="od-body sio">
          <p className="sio-offer">
            <AddressLink address={offer.maker} chars={4} /> wants <b>{wanted}</b> at{" "}
            <Soso size={14} unit={currencyLabel(offer.currency)}>
              {formatSoso(offer.priceWei)}
            </Soso>{" "}
            each. You have <b>{sorted.length}</b> that qualify.
          </p>

          {funded !== undefined && funded < Math.min(wanted, sorted.length) ? (
            <p className="sio-note">
              The bidder&rsquo;s WSOSO covers {funded} {funded === 1 ? "piece" : "pieces"} right now, so
              that is the most you can sell into it.
            </p>
          ) : null}

          {max === 0 ? (
            <p className="sio-note">
              {funded === undefined ? "Checking the bidder’s funds…" : "Nothing can be sold into this offer right now."}
            </p>
          ) : (
            <>
              <label className="sio-count">
                <span className="offers-label">How many</span>
                <input
                  inputMode="numeric"
                  placeholder={String(max)}
                  value={count}
                  disabled={busy || done}
                  onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                />
                <small>up to {max}</small>
              </label>

              <p className="sio-pieces">
                Selling{" "}
                {pieces.length <= 12
                  ? pieces.map((id) => `#${id.toString()}`).join(", ")
                  : `${pieces.slice(0, 10).map((id) => `#${id.toString()}`).join(", ")} and ${pieces.length - 10} more`}
              </p>

              <p className="sio-sum">
                You receive{" "}
                <b>
                  <Soso size={14} unit={currencyLabel(offer.currency)}>
                    {formatSoso(gross - fee)}
                  </Soso>
                </b>{" "}
                for {n} {n === 1 ? "piece" : "pieces"}, after the{" "}
                <Soso size={12} unit={currencyLabel(offer.currency)}>
                  {formatSoso(fee)}
                </Soso>{" "}
                fee. One transaction.
              </p>

              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy || done || n === 0}
                onClick={() => {
                  if (mustApprove) trade.approve();
                  else if (mustAllowFee) feeAllowance.allow();
                  else void sell();
                }}
              >
                {busy
                  ? proving
                    ? "Checking your pieces…"
                    : "Working…"
                  : mustApprove
                    ? "Approve, then sell"
                    : mustAllowFee
                      ? "Allow fee, then sell"
                      : `Sell ${n}`}
              </button>
              {mustApprove ? (
                <p className="sio-note">One approval per collection, then the sale.</p>
              ) : mustAllowFee ? (
                <p className="sio-note">The fee is taken in WSOSO from what you are paid.</p>
              ) : null}
            </>
          )}

          {proofError !== null ? <p className="sio-error">{proofError.message}</p> : null}
          <FillBlocked blocked={fill.blocked} />
          <TxResult
            hash={fill.hash ?? trade.hash}
            confirming={fill.confirming || trade.confirming}
            success={fill.isSuccess || trade.isSuccess}
            error={fill.error ?? trade.error ?? feeAllowance.error}
            successLabel={fill.isSuccess ? `Sold ${n}` : "Approved"}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
