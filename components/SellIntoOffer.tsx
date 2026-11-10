"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { PiecePicker } from "@/components/PiecePicker";
import { chosenPieces, firstPieces } from "@/lib/piecePick";
import { useT } from "@/lib/i18n";
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
 * The count picks the pieces, lowest ids first, and lists exactly which before
 * anything is signed. "Choose which" then lets the holder swap any of them for
 * another they would rather part with (2026-10-09).
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
  const t = useT();
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
  const counted = (() => {
    const typed = Number.parseInt(count, 10);
    if (count.trim() === "" || !Number.isFinite(typed)) return max;
    return Math.max(0, Math.min(typed, max));
  })();

  /** Off: the first `counted`. On: exactly the pieces chosen, never past `max`. */
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** Whether the chips are showing. Hiding them keeps the choice. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const pieces = choosing ? chosenPieces(sorted, selected, max) : sorted.slice(0, counted);
  const n = pieces.length;

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
          if (m === undefined) throw new Error(t("#{id} is not in this offer's set.", { id: tokenId.toString() }));
          return { tokenId, proof: m.proof as readonly Hex[] };
        }),
      );
      fill.acceptOfferMany(offer, proved);
    } catch (e) {
      setProofError(e instanceof Error ? e : new Error(t("Could not check your pieces just now.")));
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
      <div className="od" role="dialog" aria-modal="true" aria-label={t("Sell into this offer")}>
        <div className="od-head">
          <div>
            <p className="od-kicker">{t("Sell into an offer")}</p>
            <h2>{t(label)}</h2>
          </div>
          <button type="button" className="od-close" aria-label={t("Close")} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="od-body sio">
          <p className="sio-offer">
            {withSlots(t("{maker} wants {wanted} at {price} each. You have {held} that qualify."), {
              maker: <AddressLink address={offer.maker} chars={4} />,
              wanted: <b>{wanted}</b>,
              price: (
                <Soso size={14} unit={currencyLabel(offer.currency)}>
                  {formatSoso(offer.priceWei)}
                </Soso>
              ),
              held: <b>{sorted.length}</b>,
            })}
          </p>

          {funded !== undefined && funded < Math.min(wanted, sorted.length) ? (
            <p className="sio-note">
              {funded === 1
                ? t("The bidder’s WSOSO covers 1 piece right now, so that is the most you can sell into it.")
                : t("The bidder’s WSOSO covers {count} pieces right now, so that is the most you can sell into it.", {
                    count: funded,
                  })}
            </p>
          ) : null}

          {max === 0 ? (
            <p className="sio-note">
              {t(funded === undefined ? "Checking the bidder’s funds…" : "Nothing can be sold into this offer right now.")}
            </p>
          ) : (
            <>
              <label className="sio-count">
                <span className="offers-label">{t("How many")}</span>
                <input
                  inputMode="numeric"
                  placeholder={String(max)}
                  value={count}
                  disabled={busy || done}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
                    setCount(next);
                    if (choosing) setSelected(firstPieces(sorted, next === "" ? max : Number(next)));
                  }}
                />
                <small>{t("up to {max}", { max })}</small>
              </label>

              {choosing && pickerOpen ? (
                <PiecePicker
                  label="Pieces to sell"
                  pieces={sorted.map((id) => ({ id }))}
                  selected={selected}
                  max={max}
                  disabled={busy || done}
                  onChange={(next) => {
                    setSelected(next);
                    const chosen = chosenPieces(sorted, next, max).length;
                    setCount(chosen === max ? "" : String(chosen));
                  }}
                />
              ) : (
                <p className="sio-pieces">
                  {pieces.length <= 12
                    ? t("Selling {pieces}", { pieces: pieces.map((id) => `#${id.toString()}`).join(", ") })
                    : t("Selling {pieces} and {more} more", {
                        pieces: pieces.slice(0, 10).map((id) => `#${id.toString()}`).join(", "),
                        more: pieces.length - 10,
                      })}
                </p>
              )}
              {sorted.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-sm pp-toggle"
                  aria-expanded={choosing && pickerOpen}
                  disabled={busy || done}
                  onClick={() => {
                    /* Once chosen by hand it stays chosen by hand; this only shows or hides the chips. */
                    if (!choosing) {
                      setSelected(firstPieces(sorted, counted));
                      setChoosing(true);
                      setPickerOpen(true);
                    } else setPickerOpen(!pickerOpen);
                  }}
                >
                  {t(!choosing ? "Choose which pieces" : pickerOpen ? "Hide the list" : "Change which pieces")}
                </button>
              ) : null}

              <p className="sio-sum">
                {withSlots(
                  n === 1
                    ? t("You receive {net} for 1 piece, after the {fee} fee. One transaction.")
                    : t("You receive {net} for {count} pieces, after the {fee} fee. One transaction.", { count: n }),
                  {
                    net: (
                      <b>
                        <Soso size={14} unit={currencyLabel(offer.currency)}>
                          {formatSoso(gross - fee)}
                        </Soso>
                      </b>
                    ),
                    fee: (
                      <Soso size={12} unit={currencyLabel(offer.currency)}>
                        {formatSoso(fee)}
                      </Soso>
                    ),
                  },
                )}
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
                    ? t("Checking your pieces…")
                    : t("Working…")
                  : mustApprove
                    ? t("Approve, then sell")
                    : mustAllowFee
                      ? t("Allow fee, then sell")
                      : t("Sell {count}", { count: n })}
              </button>
              {mustApprove ? (
                <p className="sio-note">{t("One approval per collection, then the sale.")}</p>
              ) : mustAllowFee ? (
                <p className="sio-note">{t("The fee is taken in WSOSO from what you are paid.")}</p>
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
            successLabel={fill.isSuccess ? t("Sold {count}", { count: n }) : "Approved"}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * A translated sentence with markup in it: every `{name}` that `nodes` has an
 * entry for is replaced by that node, so the sentence stays one key in the
 * dictionary and the markup survives in either language.
 */
function withSlots(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/(\{\w+\})/);
  return (
    <>
      {parts.map((part, i) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return name !== undefined && name in nodes ? <Fragment key={i}>{nodes[name]}</Fragment> : part;
      })}
    </>
  );
}
