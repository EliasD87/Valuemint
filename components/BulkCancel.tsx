"use client";

import { useMemo, useState } from "react";
import { useBulkCancel } from "@/hooks/useBulkCancel";
import { Soso } from "@/components/Soso";
import { formatCount, formatSoso } from "@/lib/format";
import { tierClass } from "@/lib/tokenMetadata";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";
import "@/styles/bulklist.css";

/**
 * Withdraw many of one collection's listings at once (2026-10-03).
 *
 * The other half of `BulkList`, beside it in the portfolio and built the same
 * way: by level, because a seller repricing their Commons does not mean their
 * SuperRares, and one press must never sweep up pieces they did not mean.
 * "All" is there too, as its own explicit choice.
 *
 * Withdrawing costs nothing but gas and moves nothing — the pieces stay in the
 * wallet, unlisted — so there is no price to type, only a choice of which.
 */
const NO_LEVEL = "Unsorted";
const ALL = "All";

export interface BulkCancelItem {
  id: bigint;
  tier?: string;
  order: SeaportOrder;
}

export function BulkCancel({
  collectionName,
  items,
  minimum = 2,
}: {
  collectionName: string;
  /** This wallet's live listings in the collection. */
  items: readonly BulkCancelItem[];
  minimum?: number;
}) {
  const { cancelMany, progress, error, perTransaction, reset } = useBulkCancel();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(ALL);

  const groups = useMemo(() => {
    const map = new Map<string, BulkCancelItem[]>();
    for (const it of items) {
      const key = it.tier ?? NO_LEVEL;
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    const levels = [...map.entries()]
      .map(([name, list]) => ({ name, list }))
      .sort((a, b) => b.list.length - a.list.length);
    /* "All" only earns a chip when there is more than one level to choose between. */
    return levels.length > 1 ? [{ name: ALL, list: [...items] }, ...levels] : levels;
  }, [items]);

  const chosen = groups.find((g) => g.name === level) ?? groups[0];
  if (items.length < minimum || chosen === undefined) return null;

  const count = chosen.list.length;
  const batches = Math.ceil(count / perTransaction);
  const asking = chosen.list.reduce((sum, it) => sum + it.order.priceWei, 0n);
  const what = chosen.name === ALL || chosen.name === NO_LEVEL ? "" : `${chosen.name} `;

  if (!open) {
    return (
      <button
        className="bulk-open"
        onClick={() => setOpen(true)}
        title={`Withdraw several listings at once: ${formatCount(BigInt(items.length))} listed`}
      >
        <span className="bulk-open-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="3" />
            <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
          </svg>
        </span>
        <span className="bulk-open-text">Delist {formatCount(BigInt(items.length))}</span>
      </button>
    );
  }

  return (
    <div className="bulk">
      {groups.length > 1 ? (
        <div className="bulk-levels" role="radiogroup" aria-label="Which listings to withdraw">
          {groups.map((g) => (
            <button
              key={g.name}
              type="button"
              role="radio"
              aria-checked={g.name === chosen.name}
              className={`bulk-level chip chip-${g.name === ALL ? "common" : (tierClass(g.name) ?? "common")}${
                g.name === chosen.name ? " is-on" : ""
              }`}
              disabled={progress.busy}
              onClick={() => setLevel(g.name)}
            >
              {g.name}
              <b>{formatCount(BigInt(g.list.length))}</b>
            </button>
          ))}
        </div>
      ) : null}

      <p className="bulk-note">
        Withdraw <b>{formatCount(BigInt(count))}</b> {what}
        {count === 1 ? "listing" : "listings"}, asking{" "}
        <b>
          <Soso size={14}>{formatSoso(asking)}</Soso>
        </b>{" "}
        in total, in{" "}
        <b>
          {batches} {batches === 1 ? "transaction" : "transactions"}
        </b>
        . The pieces stay in your wallet, unlisted.
      </p>

      {progress.total > 0 ? (
        <p className={error === undefined ? "bulk-progress" : "bulk-progress is-stopped"}>
          {progress.busy
            ? `Withdrawing… ${progress.done} of ${progress.total} transactions confirmed, ${formatCount(BigInt(progress.cancelled))} delisted.`
            : error === undefined
              ? `Done. ${formatCount(BigInt(progress.cancelled))} ${progress.cancelled === 1 ? "listing is" : "listings are"} withdrawn.`
              : `Stopped after ${formatCount(BigInt(progress.cancelled))} of ${formatCount(BigInt(progress.requested))}. Those are withdrawn. Run it again for the rest.`}
        </p>
      ) : null}

      {error !== undefined ? <p className="bulk-error">{error.message}</p> : null}

      <div className="wrap-row">
        <button
          className="btn btn-primary"
          disabled={progress.busy || count === 0}
          onClick={() => {
            reset();
            void cancelMany(chosen.list.map((it) => it.order));
          }}
        >
          {progress.busy ? "Check your wallet…" : `Delist ${formatCount(BigInt(count))}`}
        </button>
        <button className="btn" disabled={progress.busy} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <p className="bulk-fine">
        Only your {what}
        {collectionName} listings are withdrawn. You can list them again at a new price straight after.
      </p>
    </div>
  );
}
