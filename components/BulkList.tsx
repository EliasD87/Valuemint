"use client";

import { useMemo, useState } from "react";
import { useBulkList } from "@/hooks/useBulkList";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import { Soso } from "@/components/Soso";
import { formatSoso, formatCount } from "@/lib/format";
import { splitFee } from "@/lib/seaport";
import { parseEther } from "viem";
import "@/styles/bulklist.css";

/**
 * List many of one collection's tokens at a single price.
 *
 * The treasure boxes arrive in the thousands and unevenly - a holder with
 * hundreds is ordinary - and every one is the same object at the same tier, so
 * "price each of these individually" is not a real workflow. What a holder
 * wants is "put fifty of my Commons up at 0.4".
 *
 * Only shown where it helps: a wallet holding one piece of a collection already
 * has a perfectly good List button on that piece's page.
 */

/** The typed price as wei, or undefined while it is not yet a number. */
function priceOf(text: string): bigint | undefined {
  if (text.trim() === "") return undefined;
  try {
    const wei = parseEther(text);
    return wei > 0n ? wei : undefined;
  } catch {
    return undefined;
  }
}

export function BulkList({
  collection,
  collectionName,
  /** Tokens the wallet holds here that are not already listed. */
  tokenIds,
}: {
  collection: `0x${string}`;
  collectionName: string;
  tokenIds: readonly bigint[];
}) {
  const { listMany, progress, error, perTransaction, reset } = useBulkList(collection);

  /**
   * Approval is per collection and once, so the bulk path needs exactly the
   * same grant the single path does. Reusing `useSeaportTrade` rather than
   * re-implementing it keeps one answer to "is Seaport allowed to move these".
   */
  const trade = useSeaportTrade(collection);

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("");
  const [price, setPrice] = useState("");

  const max = tokenIds.length;

  /** How many to list: blank means all of them, which is the common intent. */
  const wanted = useMemo(() => {
    if (count.trim() === "") return max;
    const n = Number.parseInt(count, 10);
    if (!Number.isFinite(n) || n < 1) return 0;
    return Math.min(n, max);
  }, [count, max]);

  const priceWei = priceOf(price);
  const ready = wanted > 0 && priceWei !== undefined && !progress.busy;
  const batches = Math.ceil(wanted / perTransaction);

  /** What the seller keeps, at this price, across the whole run. */
  const proceeds = useMemo(() => {
    if (priceWei === undefined) return undefined;
    const { net } = splitFee(priceWei);
    return net * BigInt(wanted);
  }, [priceWei, wanted]);

  if (max < 2) return null;

  if (!open) {
    return (
      <button className="btn btn-sm bulk-open" onClick={() => setOpen(true)}>
        List several&hellip;
      </button>
    );
  }

  return (
    <div className="bulk">
      <div className="bulk-row">
        <label className="bulk-field">
          <span>How many</span>
          <input
            type="number"
            min={1}
            max={max}
            inputMode="numeric"
            placeholder={String(max)}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            disabled={progress.busy}
          />
          <small>of {formatCount(BigInt(max))} unlisted</small>
        </label>

        <label className="bulk-field">
          <span>Price each</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={progress.busy}
          />
          <small>SOSO</small>
        </label>
      </div>

      {/* Said before the first prompt, not discovered during it: a run of 626
          is thirteen wallet confirmations and there is no way around that. */}
      <p className="bulk-note">
        {ready ? (
          <>
            {formatCount(BigInt(wanted))} {wanted === 1 ? "piece" : "pieces"} in{" "}
            <b>
              {batches} {batches === 1 ? "transaction" : "transactions"}
            </b>{" "}
            &mdash; you confirm each one. You keep{" "}
            <b>
              <Soso size={14}>{formatSoso(proceeds ?? 0n)}</Soso>
            </b>{" "}
            if every piece sells.
          </>
        ) : (
          <>Up to {perTransaction} pieces per transaction, so fewer confirmations than pieces.</>
        )}
      </p>

      {progress.total > 0 ? (
        <p className={error === undefined ? "bulk-progress" : "bulk-progress is-stopped"}>
          {progress.busy
            ? `Listing… ${progress.done} of ${progress.total} transactions confirmed, ${formatCount(BigInt(progress.listed))} pieces live.`
            : error === undefined
              ? `Done. ${formatCount(BigInt(progress.listed))} ${progress.listed === 1 ? "piece is" : "pieces are"} listed.`
              : `Stopped after ${formatCount(BigInt(progress.listed))} of ${formatCount(BigInt(progress.requested))}. Those are listed and stay listed — run it again for the rest.`}
        </p>
      ) : null}

      {error !== undefined ? <p className="bulk-error">{error.message}</p> : null}

      <div className="wrap-row">
        {trade.needsApproval ? (
          /* Once per collection, and it has to come first — Seaport cannot move
             anything until it does, however many orders are validated. */
          <button className="btn btn-primary" disabled={trade.busy} onClick={trade.approve}>
            {trade.busy ? "Check your wallet…" : "Approve once, then list"}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!ready}
            onClick={() => {
              reset();
              void listMany(tokenIds.slice(0, wanted), price);
            }}
          >
            {progress.busy ? "Check your wallet…" : `List ${formatCount(BigInt(wanted))}`}
          </button>
        )}
        <button className="btn" disabled={progress.busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <p className="bulk-fine">
        Every piece goes up at the same price. {collectionName} pieces you have already listed are
        not touched.
      </p>
    </div>
  );
}
