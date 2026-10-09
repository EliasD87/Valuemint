"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useSeaportFill } from "@/hooks/useSeaportTrade";
import { ConnectButton } from "@/components/ConnectButton";
import { FillBlocked } from "@/components/FillBlocked";
import { TxResult } from "@/components/TxResult";
import { Soso } from "@/components/Soso";
import { formatSoso } from "@/lib/format";
import { MAX_BULK_BUY } from "@/lib/seaport";
import { boughtNote, goneNote, skippedNote } from "@/lib/bulkBuy";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";
import "./BulkBuyBar.css";

/**
 * The bar that buys what has been picked, in one signature (2026-10-09).
 *
 * Fixed to the bottom of the screen while picking, so the total and the button
 * stay in reach however far down the grid somebody has scrolled to pick. The
 * total is every pick still for sale. Picks that go to someone else on the way
 * are never charged for, and the bar says how many that was (lib/bulkBuy.ts).
 */
export function BulkBuyBar({
  picked,
  gone,
  onClear,
  onDone,
}: {
  /** Picks still for sale, as far as the page knows. */
  picked: readonly SeaportOrder[];
  /** Picks the page has since seen bought or taken down. */
  gone: number;
  onClear: () => void;
  /** After a purchase lands: empty the picks. The bar stays to report. */
  onDone: () => void;
}) {
  const { isConnected } = useAccount();
  const fill = useSeaportFill();
  const queryClient = useQueryClient();
  const n = picked.length;

  useEffect(() => {
    if (!fill.isSuccess) return;
    // Pieces, listings, floors and the wallet's balance all just changed.
    void queryClient.invalidateQueries();
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill.isSuccess]);

  /** Picking again after a result or a refusal starts afresh. */
  useEffect(() => {
    if (n === 0 || fill.busy) return;
    if (fill.isSuccess || fill.error !== null) fill.reset();
    if (fill.blocked !== undefined) fill.clearBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const total = picked.reduce((sum, o) => sum + o.priceWei, 0n);
  const report = fill.bulk;
  const landed = fill.isSuccess && report?.bought !== undefined;
  const inFlight = fill.signing || fill.confirming;

  const notes = [
    !landed && !inFlight ? goneNote(gone) : undefined,
    inFlight && report !== undefined ? skippedNote(report.asked, report.sent) : undefined,
    landed ? boughtNote(report.asked, report.bought!) : undefined,
  ].filter((s): s is string => s !== undefined);

  return (
    <div className="bbb" role="region" aria-label="Bulk buy">
      <div className="bbb-inner">
        <p className="bbb-sum">
          {n === 0 ? (
            <>Tap the pieces you want. Up to {MAX_BULK_BUY} at once.</>
          ) : (
            <>
              <b>{n}</b> {n === 1 ? "piece" : "pieces"} ·{" "}
              <b>
                <Soso size={14}>{formatSoso(total)}</Soso>
              </b>
              {n >= MAX_BULK_BUY ? <span className="bbb-cap"> · the most one purchase can carry</span> : null}
            </>
          )}
        </p>
        <div className="bbb-acts">
          <button type="button" className="btn btn-sm" onClick={onClear} disabled={n === 0 || fill.busy}>
            Clear
          </button>
          {isConnected ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={n === 0 || fill.busy}
              onClick={() => void fill.buyMany(picked)}
            >
              {fill.checking
                ? "Checking…"
                : fill.signing
                  ? "Confirm in wallet…"
                  : fill.confirming
                    ? "Buying…"
                    : n === 0
                      ? "Buy"
                      : `Buy ${n}`}
            </button>
          ) : (
            <ConnectButton className="btn btn-primary btn-sm">Connect to buy</ConnectButton>
          )}
        </div>
      </div>
      <div className="bbb-status">
        {notes.map((note) => (
          <p key={note} className="bbb-note" role="status" aria-live="polite">
            {note}
          </p>
        ))}
        <FillBlocked blocked={fill.blocked} />
        <TxResult
          hash={fill.hash}
          confirming={fill.confirming}
          success={landed}
          error={fill.error}
          successLabel={`Bought ${report?.bought ?? 0}`}
        />
      </div>
    </div>
  );
}
