"use client";

import { useEffect, useMemo, useState } from "react";
import { useBulkList } from "@/hooks/useBulkList";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import { Soso } from "@/components/Soso";
import { formatSoso, formatCount } from "@/lib/format";
import { splitFee } from "@/lib/seaport";
import { tierClass } from "@/lib/tokenMetadata";
import { parseEther } from "viem";
import "@/styles/bulklist.css";

/**
 * List many of one collection's tokens at a single price — one level at a time.
 *
 * The treasure boxes arrive in the thousands and unevenly, and every box of a
 * given level is interchangeable: Common #4556 and Common #4557 are the same
 * thing. So "price each one individually" is not a real workflow. What a holder
 * wants is "put fifty of my Commons up at 0.4".
 *
 * **Level is not optional here, it is the whole point.** The first version of
 * this listed N pieces at one price by taking whichever ids came first, and a
 * wallet's boxes are mixed — the portfolio screenshot that caught it showed
 * Uncommon, Common, Common, Common in the first four cards. "List 100 at 0.001"
 * would have put SuperRares up at a Common's price, and someone would have
 * bought them. A single order is easy to check before signing; a hundred built
 * in one click is not, which is exactly why the grouping has to be the UI's job
 * rather than the seller's.
 *
 * Tokens with no level at all (most collections publish none) fall into one
 * group and behave as before.
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

/** Tokens with no published level are one group, labelled plainly. */
const NO_LEVEL = "Unsorted";

/**
 * What the box will accept, clamped as it is typed.
 *
 * `type="number"` with a `max` does not stop anybody typing past it — the
 * attribute only drives the spinner and native form validation, neither of
 * which is in play here. So the field happily showed "2" against one unlisted
 * piece while the summary and the button underneath both said "1".
 *
 * Nothing unsafe came of that: `wanted` is clamped, the ids are sliced to it,
 * and `planBulkListing` dedupes on top. But a field that displays a number the
 * rest of the panel quietly overrules is a field asking to be misread, and
 * somebody reasonably concludes they are about to list two.
 *
 * An empty box still means "all of them" — that is what the placeholder says.
 */
function clampCount(raw: string, max: number): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits === "") return "";

  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";

  return String(Math.min(Math.max(n, 1), max));
}

export interface BulkListItem {
  id: bigint;
  tier?: string;
}

export function BulkList({
  collection,
  collectionName,
  /** Tokens the wallet holds here that are not already listed. */
  items,
  /**
   * How many unlisted pieces make this control worth offering.
   *
   * Two on the portfolio, where every piece already has its own card with its
   * own way in and a bulk button beside a single token is just clutter. One in
   * the home page prompt, where there is no card and no other route — a holder
   * told "you have 1 Cybereator not for sale" and given nothing to press has
   * been told about a dead end.
   *
   * A parameter rather than a different component: listing is an approval, a
   * per-level price, a batched `validate` and a gas price ValueChain's own
   * suggestion is too low for, and a second implementation of that is a second
   * place for a seller to lose a transaction.
   */
  minimum = 2,
  /**
   * Whether the panel is open, when the surface around it needs a say.
   *
   * Uncontrolled by default, which is what `/portfolio` wants: each collection
   * has its own heading, its own room, and two open at once is fine there. The
   * home page prompt is a fixed card in the corner, where two open panels stack
   * into something taller than the screen with no way to reach either end — so
   * it keeps one at a time and needs to be able to close the other.
   */
  open: controlledOpen,
  onOpenChange,
}: {
  collection: `0x${string}`;
  collectionName: string;
  items: readonly BulkListItem[];
  minimum?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { listMany, progress, error, perTransaction, reset } = useBulkList(collection);

  /**
   * Approval is per collection and once, so the bulk path needs exactly the
   * same grant the single path does. Reusing `useSeaportTrade` keeps one answer
   * to "is Seaport allowed to move these".
   */
  const trade = useSeaportTrade(collection);

  const [selfOpen, setSelfOpen] = useState(false);

  /** Controlled when a caller supplies both, its own otherwise. */
  const open = controlledOpen ?? selfOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange !== undefined) onOpenChange(next);
    else setSelfOpen(next);
  };
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [count, setCount] = useState("");
  const [price, setPrice] = useState("");

  /** Unlisted holdings grouped by level, largest group first. */
  const groups = useMemo(() => {
    const map = new Map<string, bigint[]>();
    for (const it of items) {
      const key = it.tier ?? NO_LEVEL;
      map.set(key, [...(map.get(key) ?? []), it.id]);
    }
    return [...map.entries()]
      .map(([name, ids]) => ({ name, ids }))
      .sort((a, b) => b.ids.length - a.ids.length);
  }, [items]);

  /** Default to the biggest group, and never leave a stale level selected. */
  const chosen = groups.find((g) => g.name === level) ?? groups[0];
  useEffect(() => {
    if (chosen !== undefined && chosen.name !== level) setLevel(chosen.name);
  }, [chosen, level]);

  const max = chosen?.ids.length ?? 0;

  /** How many to list: blank means all of that level, which is the common intent. */
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

  if (items.length < minimum || chosen === undefined) return null;

  if (!open) {
    /*
      The whole bar is the control.

      It was a small outline button with `margin-left: auto` in a container
      that is not a flex row — so the auto did nothing and it sat under the
      collection's heading, alone and unexplained, looking like something left
      behind. A seller holding 626 boxes has no reason to guess that the way to
      price them is a button marked "List several…".

      So the bar says what there is to list before it offers to list it, and it
      is one target rather than a small one next to some text.
    */
    return (
      <button
        className="bulk-open"
        onClick={() => setOpen(true)}
        title={
          items.length === 1
            ? "Put this one up for sale"
            : `List several at once — ${formatCount(BigInt(items.length))} unlisted` +
              (groups.length > 1 ? ` across ${groups.length} levels` : "") +
              ", one price per level"
        }
      >
        <span className="bulk-open-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="3.25" y="3.25" width="8" height="8" rx="2" />
            <rect x="12.75" y="3.25" width="8" height="8" rx="2" />
            <rect x="3.25" y="12.75" width="8" height="8" rx="2" />
            <rect x="12.75" y="12.75" width="8" height="8" rx="2" />
          </svg>
        </span>

        {/*
          The count is the label now, and the rest is the title.

          As a full-width bar this said what there was to list before offering
          to list it, which is the right shape for a banner and the wrong one
          for a control sitting beside a link. The same facts are still here —
          the tooltip carries the long form, and the panel it opens says it
          again in full before anything is priced.
        */}
        <span className="bulk-open-text">List {formatCount(BigInt(items.length))}</span>
      </button>
    );
  }

  return (
    <div className="bulk">
      {/*
        Level first, and it drives everything below it. A Common and a SuperRare
        are different goods; pricing them together is the mistake this exists to
        make impossible.
      */}
      <div className="bulk-levels" role="radiogroup" aria-label="Which level to list">
        {groups.map((g) => (
          <button
            key={g.name}
            type="button"
            role="radio"
            aria-checked={g.name === chosen.name}
            className={`bulk-level chip chip-${tierClass(g.name) ?? "common"}${
              g.name === chosen.name ? " is-on" : ""
            }`}
            disabled={progress.busy}
            onClick={() => {
              setLevel(g.name);
              setCount("");
            }}
          >
            {g.name}
            <b>{formatCount(BigInt(g.ids.length))}</b>
          </button>
        ))}
      </div>

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
            onChange={(e) => setCount(clampCount(e.target.value, max))}
            disabled={progress.busy}
          />
          <small>
            of {formatCount(BigInt(max))} unlisted {chosen.name}
          </small>
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

      {/* Said before the first prompt, not discovered during it: a run of 626 is
          thirteen wallet confirmations and there is no way around that. */}
      <p className="bulk-note">
        {ready ? (
          <>
            {formatCount(BigInt(wanted))} <b>{chosen.name}</b>{" "}
            {wanted === 1 ? "piece" : "pieces"} in{" "}
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
          <>
            Only your {chosen.name} pieces go up, at one price. Up to {perTransaction} per
            transaction.
          </>
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
              void listMany(chosen.ids.slice(0, wanted), price);
            }}
          >
            {progress.busy
              ? "Check your wallet…"
              : `List ${formatCount(BigInt(wanted))} ${chosen.name}`}
          </button>
        )}
        <button className="btn" disabled={progress.busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <p className="bulk-fine">
        Only {chosen.name} pieces are listed, all at the same price. Other levels, and{" "}
        {collectionName} pieces you have already listed, are not touched.
      </p>
    </div>
  );
}
