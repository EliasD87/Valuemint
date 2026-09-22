"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { useWsoso } from "@/hooks/useWsoso";
import { useOwnOfferExposure } from "@/hooks/useSeaportOrders";
import { deployment } from "@/config/contracts";
import { formatSoso } from "@/lib/format";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import "./UnwrapDialog.css";

/**
 * Turning wrapped SOSO back into the real thing.
 *
 * A dialog rather than a control inside the wallet menu, for two reasons that
 * are both about the menu rather than about unwrapping. It is a narrow strip
 * with no room to type in, and it closes on any click outside itself — so an
 * amount field living in there would be a field people lose halfway through
 * filling in.
 *
 * Bids have to be in WSOSO: an offer must stand over time without the
 * marketplace holding anyone's money, so the funds stay in the bidder's wallet
 * and move on a pull, and native currency cannot be pulled. Anybody who has
 * ever bid has wrapped something, and until now nothing on this site offered to
 * undo it — `withdraw` was in the ABI from the start and no code called it.
 */
export function UnwrapDialog({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const wsoso = useWsoso(0n);

  /**
   * WSOSO already promised to standing bids.
   *
   * The whole reason this dialog does arithmetic at all. That balance sits in
   * the bidder's own wallet — the marketplace never holds it — so `withdraw`
   * will unwrap it without complaint, and every bid behind it quietly stops
   * being fillable. Nobody is told; the offers simply stop working.
   */
  const committed = useOwnOfferExposure(address, deployment.wsoso as `0x${string}`);

  const held = wsoso.balance;
  const free = held > committed ? held - committed : 0n;

  const [amount, setAmount] = useState(() => (free > 0n ? formatEther(free) : ""));
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
   * What the typed figure actually is, and whether it can be sent.
   *
   * Capped at `free` rather than at the balance. Typing past it is not refused
   * outright — the number stays as typed — but nothing above the free amount is
   * ever sent, and the line underneath says which figure won.
   */
  const wanted = useMemo(() => {
    const raw = amount.trim();
    if (raw === "") return 0n;
    try {
      const parsed = parseEther(raw);
      if (parsed <= 0n) return 0n;
      return parsed > free ? free : parsed;
    } catch {
      return 0n;
    }
  }, [amount, free]);

  const overAsked = (() => {
    try {
      return amount.trim() !== "" && parseEther(amount.trim()) > free;
    } catch {
      return false;
    }
  })();

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="uw-scrim" onClick={onClose} aria-hidden="true" />
      <div className="uw" role="dialog" aria-modal="true" aria-label="Unwrap SOSO">
        <div className="uw-head">
          <div>
            <p className="uw-kicker">Wrapped SOSO</p>
            <h2>Turn it back into SOSO</h2>
          </div>
          <button type="button" className="uw-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="uw-body">
          <dl className="uw-figures">
            <div>
              <dt>Wrapped</dt>
              <dd className="mono">
                <Soso size={14}>{formatSoso(held)}</Soso>
              </dd>
            </div>
            {committed > 0n ? (
              <div>
                <dt>Behind your offers</dt>
                <dd className="mono">
                  <Soso size={14}>{formatSoso(committed)}</Soso>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Free to unwrap</dt>
              <dd className="mono">
                <Soso size={14}>{formatSoso(free)}</Soso>
              </dd>
            </div>
          </dl>

          {/*
            Said before the field rather than after a refusal. Somebody with
            everything committed needs to know why the number is zero, not to
            discover it by typing into a box that will not accept anything.
          */}
          {committed > 0n ? (
            <p className="uw-note">
              WSOSO behind a live offer stays in your wallet — that is how an offer can stand
              without the marketplace holding your money. Unwrapping it would leave those offers
              unfillable, so it is held back. Withdraw the offer first to free it.
            </p>
          ) : null}

          {free === 0n ? null : (
            <label className="uw-field">
              <span>How much</span>
              <div className="uw-input">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={formatEther(free)}
                  disabled={wsoso.busy}
                />
                <button
                  type="button"
                  className="uw-max"
                  onClick={() => setAmount(formatEther(free))}
                  disabled={wsoso.busy}
                >
                  Max
                </button>
              </div>
              <small>
                {overAsked
                  ? `More than is free — ${formatSoso(free)} will be unwrapped.`
                  : "It arrives as SOSO in this wallet, one for one."}
              </small>
            </label>
          )}
        </div>

        <div className="uw-foot">
          <button
            type="button"
            className="btn btn-primary"
            disabled={wanted === 0n || wsoso.busy}
            onClick={() => wsoso.unwrap(formatEther(wanted))}
          >
            {wsoso.busy
              ? "Unwrapping…"
              : wanted === 0n
                ? "Nothing to unwrap"
                : `Unwrap ${formatSoso(wanted)}`}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={wsoso.busy}>
            Close
          </button>
        </div>

        <div className="uw-result">
          <TxResult
            hash={wsoso.hash}
            confirming={wsoso.confirming}
            success={wsoso.isSuccess}
            error={wsoso.error}
            successLabel="Unwrapped"
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
