"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { useDeferred } from "@/hooks/useDeferred";
import { useHoldings } from "@/hooks/useHoldings";
import { BulkList, type BulkListItem } from "@/components/BulkList";
import { formatCount } from "@/lib/format";
import { Art } from "@/components/Art";
import { soleArtworkFor } from "@/config/covers";
import "./ListPrompt.css";

/**
 * "You hold three of these and none are for sale." — on the way in.
 *
 * Selling something you already own took finding `/portfolio`, finding the
 * collection, finding the piece, and only then a price field. Every step of
 * that is a place to give up, and none of it tells you there was anything to
 * sell in the first place. Most holders never learn they can.
 *
 * So the prompt goes where people land, and carries the same `BulkList` the
 * portfolio uses rather than a second listing form. That matters more than the
 * duplication it saves: listing is an approval, a per-level price, a batched
 * `validate`, and a gas price that ValueChain's own suggestion is too low for.
 * A second implementation of that would be a second place for a seller to lose
 * a transaction.
 */

/** One collection's unlisted holdings. */
interface Group {
  address: `0x${string}`;
  name: string;
  items: BulkListItem[];
  /** The first piece's artwork, to show what the row is about. */
  image?: string;
}

/**
 * What the reader has already said no to.
 *
 * Keyed by what they hold, not by time. Dismissing means "I know about these
 * three and I don't want to sell them", which stays true until the three
 * change — so acquiring a fourth is worth mentioning again, and nothing else
 * is. A plain "dismissed for a week" would either nag about the same pieces or
 * stay silent through a purchase.
 */
function signatureOf(address: string, groups: Group[]): string {
  const parts = groups
    .map((g) => `${g.address.toLowerCase()}:${g.items.length}`)
    .sort()
    .join(",");
  return `${address.toLowerCase()}|${parts}`;
}

const STORE_KEY = "valuemint-list-prompt";

/** Every read and write guarded: storage throws in a private window and is empty in previews. */
function alreadyDismissed(signature: string): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) === signature;
  } catch {
    return false;
  }
}

function remember(signature: string): void {
  try {
    window.localStorage.setItem(STORE_KEY, signature);
  } catch {
    /* Nothing to do. The prompt reappears next visit, which is survivable. */
  }
}

export function ListPrompt() {
  const { address } = useAccount();

  /**
   * Held back until the page has issued the reads it paints with.
   *
   * This costs two multicalls and a metadata read, and it is a panel in the
   * corner — nothing on the home page should wait behind it. Same reasoning as
   * the activity feed, and the same tool. See `useDeferred`.
   */
  const ready = useDeferred(1_500);

  const { tokens, isLoading } = useHoldings(ready ? address : undefined);
  const [dismissed, setDismissed] = useState(false);

  /**
   * Which row's panel is open — at most one.
   *
   * Left to themselves, two panels stack into a card taller than the viewport
   * with neither end reachable. On the portfolio that cannot happen; each
   * collection has its own room. Here they share a corner.
   */
  const [openRow, setOpenRow] = useState<string | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /** Only what is not already for sale. Re-listing a live order is never the offer. */
  const groups = useMemo<Group[]>(() => {
    const by = new Map<string, Group>();

    for (const t of tokens) {
      if (t.listing !== undefined) continue;
      const key = t.collection.toLowerCase();
      const group = by.get(key) ?? {
        address: t.collection,
        name: t.collectionName,
        items: [] as BulkListItem[],
        /**
         * Our own copy where we ship one, the piece's own artwork otherwise —
         * the same preference `TokenCard` makes, and for the same reason: for
         * these collections they are the same picture and ours is a third of
         * the frames. See `soleArtworkFor`.
         */
        image: soleArtworkFor(t.collection) ?? t.image,
      };
      group.items.push({ id: t.id, tier: t.tier });
      by.set(key, group);
    }

    return [...by.values()].sort((a, b) => b.items.length - a.items.length);
  }, [tokens]);

  const signature = address === undefined ? "" : signatureOf(address, groups);

  /**
   * Reset when the holdings change, so a new piece is mentioned even to
   * somebody who dismissed the last one.
   */
  useEffect(() => setDismissed(false), [signature]);

  if (!mounted || address === undefined || isLoading) return null;
  if (groups.length === 0 || dismissed || alreadyDismissed(signature)) return null;

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const close = () => {
    remember(signature);
    setDismissed(true);
  };

  /**
   * Portalled, like every other floating thing here.
   *
   * A `position: fixed` panel rendered inside the page centres itself against
   * the nearest ancestor with a transform or a backdrop-filter rather than the
   * viewport, and the home page has several. `document.body` has none.
   */
  return createPortal(
    <aside className="lp" role="region" aria-label="Pieces you could list">
      <div className="lp-head">
        {/*
          "Not listed", because that is what every card and every token page
          already calls this state. "Not for sale" was a third phrase for the
          same thing, and it reads as a fact about the pieces — that they are
          unavailable — rather than as the offer this panel is making.
        */}
        <p className="lp-title">
          You hold <strong>{formatCount(BigInt(total))}</strong>
          {total === 1 ? " piece that isn’t listed" : " pieces that aren’t listed"}
        </p>
        <button type="button" className="lp-close" onClick={close} aria-label="Dismiss">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <ul className="lp-rows">
        {groups.map((g) => (
          <li key={g.address} className="lp-row">
            <span className="lp-piece">
              {/*
                `position: relative` on the wrapper is load-bearing, not
                decoration — `Art` renders through next/image with `fill`, so it
                sizes against the nearest positioned ancestor. Without it the
                artwork escapes the box and covers the page. See
                `.inbox-thumb`, where that happened for real.
              */}
              <span className="lp-thumb">
                {g.image === undefined ? (
                  <span className="lp-thumb-empty" aria-hidden="true" />
                ) : (
                  <Art src={g.image} alt="" sizes="44px" />
                )}
              </span>
              <span className="lp-name">
                <strong>{formatCount(BigInt(g.items.length))}</strong> {g.name}
              </span>
            </span>
            {/*
              The portfolio's own control, unchanged. It knows about approval,
              about pricing each level separately, and about batching — none of
              which is worth rebuilding here, and all of which is worth getting
              right in one place.
            */}
            <BulkList
              collection={g.address}
              collectionName={g.name}
              items={g.items}
              /* One is enough here: there is no card beside it offering another way. */
              minimum={1}
              open={openRow === g.address}
              onOpenChange={(next) => setOpenRow(next ? g.address : undefined)}
            />
          </li>
        ))}
      </ul>
    </aside>,
    document.body,
  );
}
