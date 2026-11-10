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
import { useT } from "@/lib/i18n";
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
  const t = useT();
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

  /**
   * The same three notes as lib/bulkBuy.ts, each with its own dictionary key.
   * The lib still decides whether a note is due; the wording here matches it
   * word for word in English, so only the language changes.
   */
  const notes = [
    !landed && !inFlight && goneNote(gone) !== undefined
      ? gone === 1
        ? t("1 of your picks was just bought by someone else or taken down, so it is off your list.")
        : t("{gone} of your picks were just bought by someone else or taken down, so they are off your list.", { gone })
      : undefined,
    inFlight && report !== undefined && skippedNote(report.asked, report.sent) !== undefined
      ? skippedText(report.asked - report.sent, report.sent)
      : undefined,
    landed && boughtNote(report.asked, report.bought!) !== undefined
      ? boughtText(report.asked, report.bought!)
      : undefined,
  ].filter((s): s is string => s !== undefined);

  function skippedText(skipped: number, sent: number): string {
    if (skipped === 1) {
      return sent === 1
        ? t("1 of your picks has just gone to someone else, so this buys the other one.")
        : t("1 of your picks has just gone to someone else, so this buys the other {sent}.", { sent });
    }
    return sent === 1
      ? t("{skipped} of your picks have just gone to someone else, so this buys the other one.", { skipped })
      : t("{skipped} of your picks have just gone to someone else, so this buys the other {sent}.", { skipped, sent });
  }

  function boughtText(asked: number, bought: number): string {
    const missed = asked - bought;
    const got = bought === 1 ? t("1 piece") : t("{count} pieces", { count: bought });
    return missed === 1
      ? t("You got {got} of {asked}. Someone else got the other one first, and you were not charged for it.", { got, asked })
      : t("You got {got} of {asked}. Someone else got the other {missed} first, and you were not charged for them.", {
          got,
          asked,
          missed,
        });
  }

  return (
    <div className="bbb" role="region" aria-label={t("Bulk buy")}>
      <div className="bbb-inner">
        <p className="bbb-sum">
          {n === 0 ? (
            <>{t("Tap the pieces you want. Up to {max} at once.", { max: MAX_BULK_BUY })}</>
          ) : (
            <>
              <b>{n}</b> {n === 1 ? t("piece") : t("pieces")} ·{" "}
              <b>
                <Soso size={14}>{formatSoso(total)}</Soso>
              </b>
              {n >= MAX_BULK_BUY ? <span className="bbb-cap">{t(" · the most one purchase can carry")}</span> : null}
            </>
          )}
        </p>
        <div className="bbb-acts">
          <button type="button" className="btn btn-sm" onClick={onClear} disabled={n === 0 || fill.busy}>
            {t("Clear")}
          </button>
          {isConnected ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={n === 0 || fill.busy}
              onClick={() => void fill.buyMany(picked)}
            >
              {fill.checking
                ? t("Checking…")
                : fill.signing
                  ? t("Confirm in wallet…")
                  : fill.confirming
                    ? t("Buying…")
                    : n === 0
                      ? t("Buy")
                      : t("Buy {count}", { count: n })}
            </button>
          ) : (
            <ConnectButton className="btn btn-primary btn-sm">{t("Connect to buy")}</ConnectButton>
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
          successLabel={t("Bought {count}", { count: report?.bought ?? 0 })}
        />
      </div>
    </div>
  );
}
