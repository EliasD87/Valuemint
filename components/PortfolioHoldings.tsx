"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Art } from "@/components/Art";
import { BulkList } from "@/components/BulkList";
import { BulkCancel } from "@/components/BulkCancel";
import { Select } from "@/components/Select";
import { Soso } from "@/components/Soso";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { VerifiedMark } from "@/components/VerifiedMark";
import { bundledArtworkFor, soleArtworkFor } from "@/config/covers";
import { useGridColumns } from "@/hooks/useGridColumns";
import { holdingsAnchor } from "@/lib/anchors";
import { floorForTier } from "@/lib/floors";
import { formatCount, formatSoso, formatSosoFixed } from "@/lib/format";
import { isFilterable } from "@/lib/traitRoles";
import { isTierTrait } from "@/lib/tokenMetadata";
import type { ChainToken } from "@/hooks/useEverything";

type Status = "all" | "listed" | "unlisted";
type Sort = "value-desc" | "value-asc" | "price-asc" | "collection";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "value-desc", label: "Highest floor" },
  { value: "value-asc", label: "Lowest floor" },
  { value: "price-asc", label: "Listed, cheapest first" },
  { value: "collection", label: "Collection and number" },
];

/** Rows of cards drawn before "Show more". A page is whole rows, never a ragged one. */
const ROWS_PER_PAGE = 5;

interface Group {
  address: `0x${string}`;
  name: string;
  items: ChainToken[];
  /** Every priced piece at its floor, in wei. */
  value: bigint;
  priced: number;
  listed: number;
  image?: string;
}

/**
 * What a wallet holds: its collections down the side, and the pieces in one grid.
 *
 * ---
 *
 * **It replaced one stacked section per collection (2026-10-24).** Each
 * collection was a heading, a trait row and one row of cards with "Show all"
 * under it, so the only way to see what a wallet held across everything was to
 * scroll the length of the page, and the only way to find one piece was to
 * know which section it was in. The side list answers the first question at a
 * glance — each collection with its count, its value at floor and its share of
 * the whole, as a bar — and the grid with search, a listed filter and a sort
 * answers the second.
 *
 * **Per-collection tools live on the collection.** Bulk listing and bulk
 * delisting act on one contract, so they appear once one is picked, in a bar
 * above the grid with that collection's trait counts. They act on everything
 * held there, never on whatever the filters happen to be showing: a filter is
 * a reading convenience and must not quietly change what a button does.
 *
 * **Values use the rule the cards use** (`floorForTier`), so the side list, the
 * header total and the plates on the cards always add up to each other.
 *
 * Shared by /portfolio and /address/…; `own` turns off what only a holder can
 * do — bulk listing a stranger's pieces is not something the viewer can sign.
 */
export function PortfolioHoldings({
  tokens,
  viewer,
  own,
  floorFor,
  tierRowsFor,
  selected,
  onSelect,
  discovering,
  expected,
}: {
  tokens: ChainToken[];
  viewer: `0x${string}` | undefined;
  own: boolean;
  floorFor: (address: string) => bigint | undefined;
  /** Every tier's cheapest ask — see lib/floors.ts. */
  tierRowsFor: (address: string) => { tier: string; price: bigint; count: number }[];
  /** The picked collection, lower-cased, or undefined for all of them. */
  selected: string | undefined;
  onSelect: (collection: string | undefined) => void;
  /** More pieces are still being found; draw where they will go. */
  discovering: boolean;
  /** How many pieces the balances say there are. */
  expected: number;
}) {
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("value-desc");
  const [query, setQuery] = useState("");
  const [traitFilter, setTraitFilter] = useState<Record<string, string>>({});

  const valueOf = (t: ChainToken) =>
    floorForTier(t.tier, tierRowsFor(t.collection), floorFor(t.collection));

  /** One entry per collection, most valuable first. */
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const t of tokens) {
      const key = t.collection.toLowerCase();
      const g = map.get(key) ?? {
        address: t.collection,
        name: t.collectionName,
        items: [],
        value: 0n,
        priced: 0,
        listed: 0,
      };
      g.items.push(t);
      const v = floorForTier(t.tier, tierRowsFor(t.collection), floorFor(t.collection));
      if (v !== undefined) {
        g.value += v;
        g.priced += 1;
      }
      if (t.listing !== undefined) g.listed += 1;
      /* The same picture ListPrompt and the cards would show for it. */
      g.image ??= soleArtworkFor(t.collection) ?? bundledArtworkFor(t.image, t.uri) ?? t.image;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) =>
      a.value !== b.value ? (b.value > a.value ? 1 : -1) : b.items.length - a.items.length,
    );
  }, [tokens, floorFor, tierRowsFor]);

  const total = groups.reduce((sum, g) => sum + g.value, 0n);
  const order = new Map(groups.map((g, i) => [g.address.toLowerCase(), i]));
  const group = selected === undefined ? undefined : groups.find((g) => g.address.toLowerCase() === selected);
  /**
   * A collection picked by a link before its pieces have arrived stays picked
   * while they are still being found. Once everything is in and it is not
   * there, the wallet holds none of it, and the whole wallet shows instead.
   */
  const picked = group !== undefined || discovering ? selected : undefined;
  const scope = picked === undefined ? tokens : (group?.items ?? []);

  /**
   * The picked collection's traits, counted — "how many of each do I hold" is
   * the point, so the counts sit on the chips. Its rarity row alone where it
   * has one: Genesis showed nine chips of design names above the four that say
   * what the pieces are worth, and the owner asked for the tier only
   * (2026-09-26). A single-valued trait is kept: "all 12 are Common" is
   * exactly the kind of answer this row gives.
   */
  const traits = useMemo(() => {
    if (group === undefined) return [];
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
    const all = [...out.entries()];
    const tiers = all.filter(([type]) => isTierTrait(type));
    return (tiers.length > 0 ? tiers : all).map(
      ([type, values]) => [type, [...values.entries()].sort((x, y) => y[1] - x[1])] as const,
    );
  }, [group]);

  /* A trait picked in one collection means nothing in the next. */
  const activeTraits =
    group === undefined ? [] : Object.entries(traitFilter).filter(([, v]) => v !== "");

  const needle = query.trim().toLowerCase().replace(/^#/, "");
  const matches = (t: ChainToken) =>
    needle === "" ||
    t.id.toString().includes(needle) ||
    (t.design ?? "").toLowerCase().includes(needle) ||
    t.collectionName.toLowerCase().includes(needle);

  const inScope = scope.filter(
    (t) =>
      matches(t) &&
      activeTraits.every(([type, value]) =>
        (t.metadata?.attributes ?? []).some((a) => a.trait_type === type && String(a.value) === value),
      ),
  );
  const listedCount = inScope.filter((t) => t.listing !== undefined).length;
  const filtered = inScope.filter((t) =>
    status === "all" ? true : status === "listed" ? t.listing !== undefined : t.listing === undefined,
  );

  /** Unpriced last whichever way the floors are sorted: "no floor" is not "cheapest". */
  const byValue = (a: ChainToken, b: ChainToken, dir: 1 | -1) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va === undefined || vb === undefined) return va === vb ? 0 : va === undefined ? 1 : -1;
    return va === vb ? 0 : (va > vb ? 1 : -1) * dir;
  };
  const byCollection = (a: ChainToken, b: ChainToken) =>
    (order.get(a.collection.toLowerCase()) ?? 0) - (order.get(b.collection.toLowerCase()) ?? 0) ||
    (a.id === b.id ? 0 : a.id > b.id ? 1 : -1);

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "collection") return byCollection(a, b);
    if (sort === "price-asc") {
      const pa = a.listing?.price;
      const pb = b.listing?.price;
      if (pa !== undefined && pb !== undefined && pa !== pb) return pa > pb ? 1 : -1;
      if ((pa === undefined) !== (pb === undefined)) return pa === undefined ? 1 : -1;
      return byValue(a, b, -1) || byCollection(a, b);
    }
    return byValue(a, b, sort === "value-desc" ? -1 : 1) || byCollection(a, b);
  });

  /**
   * Whole rows at a time, read from the grid itself — see `useGridColumns`.
   *
   * Paging starts again whenever what is being shown changes. Kept beside the
   * filters it belongs to rather than reset in an effect, so a new filter never
   * draws one frame at the old depth first.
   */
  const grid = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(grid);
  const perPage = (columns > 0 ? columns : 4) * ROWS_PER_PAGE;
  const view = `${picked ?? ""}|${status}|${sort}|${needle}|${JSON.stringify(activeTraits)}`;
  const [paging, setPaging] = useState({ view, pages: 1 });
  const pages = paging.view === view ? paging.pages : 1;
  const shown = sorted.slice(0, pages * perPage);
  const remaining = sorted.length - shown.length;

  const collectionFloor = group === undefined ? undefined : floorFor(group.address);
  const tierRows = group === undefined ? [] : tierRowsFor(group.address);
  const tiered = group?.items.some((t) => t.tier !== undefined) ?? false;
  const tierFloor = (tier: string) => tierRows.find((r) => r.tier === tier)?.price;

  const filtering = needle !== "" || status !== "all" || activeTraits.length > 0;
  const clearAll = () => {
    setQuery("");
    setStatus("all");
    setTraitFilter({});
  };

  const pick = (collection: string | undefined) => {
    setTraitFilter({});
    onSelect(collection);
  };

  return (
    <div className="pf-collected">
      {/* -------------------------------------------------- the collections */}
      <nav className="pf-colls" aria-label="Collections held">
        <p className="pf-colls-title">
          Collections <span>{formatCount(BigInt(groups.length))}</span>
        </p>
        <ul className="pf-colls-list">
          <li>
            <button type="button" className="pf-c" aria-pressed={picked === undefined} onClick={() => pick(undefined)}>
              <span className="pf-c-thumb pf-c-all" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <rect x="2" y="2" width="5" height="5" rx="1.2" />
                  <rect x="9" y="2" width="5" height="5" rx="1.2" />
                  <rect x="2" y="9" width="5" height="5" rx="1.2" />
                  <rect x="9" y="9" width="5" height="5" rx="1.2" />
                </svg>
              </span>
              <span className="pf-c-name">All collections</span>
              <span className="pf-c-meta">
                {formatCount(BigInt(tokens.length))} {tokens.length === 1 ? "piece" : "pieces"}
              </span>
              <span className="pf-c-value">
                <Soso size={11}>{formatSosoFixed(total)}</Soso>
              </span>
            </button>
          </li>
          {groups.map((g) => {
            const key = g.address.toLowerCase();
            /* Share of the priced whole, as a bar. Width only — the numbers
               beside it say the rest. */
            const share = total > 0n ? Number((g.value * 1000n) / total) / 10 : 0;
            return (
              <li key={key} id={holdingsAnchor(g.address)} className="holdings-anchor">
                <button
                  type="button"
                  className="pf-c"
                  aria-pressed={picked === key}
                  onClick={() => pick(picked === key ? undefined : key)}
                >
                  <span className="pf-c-thumb">
                    {g.image === undefined ? null : <Art src={g.image} alt="" sizes="40px" />}
                  </span>
                  <span className="pf-c-name">
                    <span className="pf-c-name-text">{g.name}</span>
                    <VerifiedMark collection={g.address} size={12} />
                  </span>
                  <span className="pf-c-meta">
                    {formatCount(BigInt(g.items.length))} {g.items.length === 1 ? "piece" : "pieces"}
                    {g.listed > 0 ? <> &middot; {formatCount(BigInt(g.listed))} listed</> : null}
                  </span>
                  <span className="pf-c-value">
                    {g.priced === 0 ? (
                      <span className="pf-c-none" title="Nothing comparable is listed">
                        No floor
                      </span>
                    ) : (
                      <Soso size={11}>{formatSosoFixed(g.value)}</Soso>
                    )}
                  </span>
                  <span className="pf-c-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(share, g.priced > 0 ? 1.5 : 0)}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="pf-pieces">
        {/* ---------------------------------------- the picked collection */}
        {group === undefined ? null : (
          <div className="pf-cbar">
            <div className="pf-cbar-head">
              <div className="pf-cbar-id">
                <h3 className="pf-cbar-name">
                  {group.name}
                  <VerifiedMark collection={group.address} size={16} />
                </h3>
                {/* The collection's floor beside the count, unless it prices by
                    tier: then the one floor is the cheapest tier's, and above a
                    row of Epics it read as the price of all of them. Each tier's
                    own floor is on its chip below instead. */}
                <p className="pf-cbar-meta">
                  {formatCount(BigInt(group.items.length))} held
                  {group.listed > 0 ? <> &middot; {formatCount(BigInt(group.listed))} listed</> : null}
                  {tiered || collectionFloor === undefined ? null : (
                    <>
                      {" "}
                      &middot; floor <Soso size={11}>{formatSoso(collectionFloor)}</Soso>
                    </>
                  )}
                </p>
              </div>
              <div className="pf-cbar-tools">
                {/* Only the unlisted ones: re-listing something already up
                    would put two live orders on one token at two prices, and a
                    buyer takes the cheaper. */}
                {own ? (
                  <BulkList
                    collection={group.address}
                    collectionName={group.name}
                    items={group.items
                      .filter((t) => t.listing === undefined)
                      .map((t) => ({ id: t.id, tier: t.tier, name: t.design }))}
                  />
                ) : null}
                {own ? (
                  <BulkCancel
                    collectionName={group.name}
                    items={group.items.flatMap((t) =>
                      t.listing === undefined ? [] : [{ id: t.id, tier: t.tier, order: t.listing.order }],
                    )}
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
                          aria-pressed={traitFilter[type] === value}
                          onClick={() =>
                            setTraitFilter((f) => ({ ...f, [type]: f[type] === value ? "" : value }))
                          }
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
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------ the tools */}
        <div className="pf-tools">
          <label className="pf-search">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or number"
              aria-label={own ? "Search your pieces" : "Search this wallet's pieces"}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <div className="pf-seg" role="group" aria-label="Show">
            {(
              [
                ["all", "All", inScope.length],
                ["listed", "Listed", listedCount],
                ["unlisted", "Not listed", inScope.length - listedCount],
              ] as const
            ).map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label} <em>{formatCount(BigInt(count))}</em>
              </button>
            ))}
          </div>

          <Select
            className="pf-sort"
            label="Sort pieces"
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={SORTS}
          />
        </div>

        {/* ------------------------------------------------------- the grid */}
        {sorted.length === 0 && !discovering ? (
          <div className="pf-none">
            <p>
              {filtering
                ? "Nothing here matches."
                : group === undefined
                  ? "Nothing to show yet."
                  : `${own ? "You hold" : "This wallet holds"} nothing in ${group.name} any more.`}
            </p>
            {filtering ? (
              <button type="button" className="btn btn-sm" onClick={clearAll}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid-tokens" ref={grid}>
          {shown.map((t, i) => (
            <TokenCard
              key={`${t.collection}-${t.id}`}
              token={t}
              collection={t.collection}
              collectionName={t.collectionName}
              listing={t.listing}
              owner={t.owner}
              viewerAddress={viewer}
              /* Every card here is the same wallet's, so the badge marks
                 nothing. The addresses still go in: they are also what stops a
                 card offering its holder a bid on their own piece. */
              markOwned={false}
              priority={i < 4}
              /*
                This piece's own tier floor, or none — never the collection's
                cheapest tier standing in for an Epic with nothing listed. See
                lib/floors.ts.
              */
              floor={valueOf(t)}
            />
          ))}
          {/* More is coming: the balances are known before the ids are, so
              the space they will fill is drawn rather than the grid ending as
              if that were everything. */}
          {discovering && remaining === 0 && !filtering
            ? Array.from({ length: Math.min(4, Math.max(1, expected - tokens.length)) }, (_, i) => (
                <TokenCardSkeleton key={`more-${i}`} />
              ))
            : null}
        </div>

        {remaining > 0 || pages > 1 ? (
          <div className="pf-more-row">
            {remaining > 0 ? (
              <button
                type="button"
                className="btn btn-sm pf-more"
                onClick={() => setPaging({ view, pages: pages + 1 })}
              >
                Show more
              </button>
            ) : null}
            <span className="pf-more-count">
              Showing {formatCount(BigInt(shown.length))} of {formatCount(BigInt(sorted.length))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
