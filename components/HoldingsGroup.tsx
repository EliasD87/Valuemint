"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { holdingsAnchor } from "@/lib/anchors";
import { BulkList } from "@/components/BulkList";
import { TokenCard } from "@/components/TokenCard";
import { Soso } from "@/components/Soso";
import { useGridColumns } from "@/hooks/useGridColumns";
import { floorForTier } from "@/lib/floors";
import { formatSoso } from "@/lib/format";
import { isFilterable } from "@/lib/traitRoles";
import { isTierTrait } from "@/lib/tokenMetadata";
import type { ChainToken } from "@/hooks/useEverything";

/** One collection's worth of what a wallet holds. */
export interface HoldingsGroupData {
  name: string;
  address: `0x${string}`;
  items: ChainToken[];
}

/**
 * A collection's pieces, one row deep until asked for more.
 *
 * A wallet holding sixty pieces of one collection turned this page into sixty
 * cards of scrolling before the next collection was reachable at all, so the
 * thing most people open it for — what do I hold, across everything — was the
 * thing the layout made hardest. One row each means the whole portfolio fits in
 * a screen or two whatever is in it, and the rest is one press away.
 *
 * A row is however many cards the grid is drawing at this width, read from the
 * grid itself rather than guessed from a breakpoint — see `useGridColumns`. A
 * guess would clip a row short or spill onto a second one, and would be wrong
 * again the next time the stylesheet moved.
 *
 * Shared by /portfolio and /address/…, which is why it lives here: the lookup
 * page was a flat wall of every card a wallet held, with none of this. `own`
 * is the one difference — bulk listing is a tool for the holder, and on
 * somebody else's wallet it would offer to list pieces the viewer cannot sign
 * for.
 */
export function HoldingsGroup({
  group,
  viewer,
  floorFor,
  tierRowsFor,
  own = true,
}: {
  group: HoldingsGroupData;
  viewer: `0x${string}` | undefined;
  floorFor: (address: string) => bigint | undefined;
  /** Every tier's cheapest ask — see lib/floors.ts. */
  tierRowsFor: (address: string) => { tier: string; price: bigint; count: number }[];
  /** The viewer holds these pieces. False on somebody else's /address page. */
  own?: boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(grid);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Record<string, string>>({});

  /**
   * What this wallet holds of each trait, counted.
   *
   * Asked for as "how many of a specific trait the user has", so the counts are
   * the point and they sit on the chips rather than inside a dropdown, where
   * the collection page keeps them. Same axes as the collection page, via
   * `isFilterable`: Edition and Editions Minted are serials and bookkeeping,
   * not things anybody holds "some of".
   *
   * A trait with a single value is KEPT here, unlike on the collection page. A
   * filter on it narrows nothing, but "all 12 are Common" is exactly the kind
   * of answer this row exists to give.
   */
  const traits = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const t of group.items) {
      for (const a of t.metadata?.attributes ?? []) {
        if (a.trait_type === undefined || a.value === undefined) continue;
        if (!isFilterable(a.trait_type)) continue;
        const value = String(a.value);
        const inner = out.get(a.trait_type) ?? new Map<string, number>();
        inner.set(value, (inner.get(value) ?? 0) + 1);
        out.set(a.trait_type, inner);
      }
    }
    return [...out.entries()].map(
      ([type, values]) => [type, [...values.entries()].sort((x, y) => y[1] - x[1])] as const,
    );
  }, [group.items]);

  const active = Object.entries(filter).filter(([, v]) => v !== "");
  const items =
    active.length === 0
      ? group.items
      : group.items.filter((t) =>
          active.every(([type, value]) =>
            (t.metadata?.attributes ?? []).some(
              (a) => a.trait_type === type && String(a.value) === value,
            ),
          ),
        );

  const toggle = (type: string, value: string) =>
    setFilter((f) => ({ ...f, [type]: f[type] === value ? "" : value }));

  /**
   * Four until the grid has been measured.
   *
   * The measurement is a layout effect and lands before paint, so this is
   * normally never seen — but it is the answer if `ResizeObserver` or
   * `getComputedStyle` gives nothing, and content must never depend on a
   * mechanism that might not run. Four is one row on a desktop; being wrong
   * costs a row that is short or long, not an empty page.
   */
  const perRow = columns > 0 ? columns : 4;
  const shown = expanded ? items : items.slice(0, perRow);
  const hidden = items.length - shown.length;

  const collectionFloor = floorFor(group.address);
  /** Unfiltered, because pricing a piece is not the same question as showing a breakdown. */
  const tierRows = tierRowsFor(group.address);

  /**
   * Whether this collection prices by tier.
   *
   * If it does, the one floor beside the heading goes: it is the minimum across
   * every tier, and "238 held · floor 8.98" above a row of Super Rares and
   * Uncommons read as the price of all of them — 8.98 was the Commons'. Each
   * tier's own floor rides on its chip in the trait row instead.
   */
  const tiered = group.items.some((t) => t.tier !== undefined);
  const tierFloor = (tier: string) => tierRows.find((r) => r.tier === tier)?.price;

  return (
    /*
      Named so the listing prompt can send somebody straight here.

      `scroll-margin-top` is what makes the anchor land correctly rather than
      under the sticky header — without it the browser scrolls the heading to
      y=0, which is behind the 72px bar, and the reader arrives at a collection
      whose name they cannot see. See `.holdings-anchor` in portfolio's styles.
    */
    <div id={holdingsAnchor(group.address)} className="holdings-anchor">
      <div className="head head-sub">
        <div>
          {/* The collection's floor beside the count, so the group says what it
              is worth as well as how much of it there is. Omitted rather than
              zeroed when nothing in the collection is listed — there is no
              floor then, and 0 would be a different claim entirely. */}
          <p className="eyebrow eyebrow-dim">
            {group.items.length} held
            {tiered || collectionFloor === undefined ? null : (
              <>
                {" · floor "}
                <Soso size={12}>{formatSoso(collectionFloor)}</Soso>
              </>
            )}
          </p>
          <h3>{group.name}</h3>
        </div>
        {/* Both ways out of this group, side by side. The bulk button used to
            be a full-width bar under the heading, which put a banner between a
            collection's name and its pieces. */}
        <div className="head-tools">
          {own ? (
            <BulkList
              collection={group.address}
              collectionName={group.name}
              items={group.items
                .filter((t) => t.listing === undefined)
                .map((t) => ({ id: t.id, tier: t.tier }))}
            />
          ) : null}
          <Link className="head-link" href={`/collection/${group.address}`}>
            View collection &rarr;
          </Link>
        </div>
      </div>

      {traits.length === 0 ? null : (
        <div className="hg-traits">
          {traits.map(([type, values]) => (
            <div key={type} className="hg-trait" role="group" aria-label={`${type} held`}>
              <span className="hg-trait-label">{type}</span>
              {values.map(([value, count]) => {
                /* Only the tier axis has floors; a design or a background does not. */
                const floor = isTierTrait(type) ? tierFloor(value) : undefined;
                return (
                  <button
                    key={value}
                    type="button"
                    className="filt"
                    aria-pressed={filter[type] === value}
                    onClick={() => toggle(type, value)}
                  >
                    {value} <em>{count}</em>
                    {floor === undefined ? null : (
                      <span className="hg-floor">
                        floor <Soso size={11}>{formatSoso(floor)}</Soso>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {active.length > 0 ? (
            <button type="button" className="hg-clear" onClick={() => setFilter({})}>
              Clear &middot; showing {items.length} of {group.items.length}
            </button>
          ) : null}
        </div>
      )}

      {/*
        Only the unlisted ones, and only where there is more than one.
        Re-listing something already up would put two live orders on one token
        at two prices, and a buyer takes the cheaper — so the pieces already for
        sale are deliberately not offered here.

        Deliberately the whole group and not the visible row: bulk listing is
        about everything held here, and collapsing the grid is a reading
        convenience that must not quietly change what a button acts on.
      */}
      <div className="grid-tokens" ref={grid}>
        {shown.map((t) => (
          <TokenCard
            key={`${t.collection}-${t.id}`}
            token={t}
            collection={t.collection}
            listing={t.listing}
            owner={t.owner}
            viewerAddress={viewer}
            /* Every card here is the same wallet's, so the badge marks nothing.
               The addresses above still go in, because they are also what stops
               a card offering its holder a bid on their own piece. */
            markOwned={false}
            /*
              This piece's own tier floor, or none.

              The distinction is the whole point. A collection holding Epics and
              Commons has two floors, and quoting the Common one against an Epic
              tells its owner precisely the wrong thing about what they hold.

              It used to fall through to the collection floor whenever a tier had
              nothing listed, which fired exactly when it was most wrong: the
              collection floor is the minimum across every tier, so a Super Rare
              with none for sale was shown the cheapest Common's asking price and
              told it was its floor. `floorForTier` says nothing instead, and the
              card omits the plate. See lib/floors.ts.
            */
            floor={floorForTier(t.tier, tierRows, collectionFloor)}
          />
        ))}
      </div>

      {hidden > 0 || expanded ? (
        <div className="pf-more-row">
          {/* The button names the total rather than the remainder: "Show all
              1000" is what somebody is deciding about, and a second label
              saying "997 more" beside it was the same fact twice. */}
          <button
            type="button"
            className="btn btn-sm pf-more"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Show fewer" : `Show all ${items.length}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
