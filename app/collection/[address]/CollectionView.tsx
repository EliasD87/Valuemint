"use client";

import { CYBEREATOR } from "@/lib/cybereator";
import { CYBEREATOR_LEVELS } from "@/lib/cybereatorRarity";
import { useCybereatorOpened, type SealFilter } from "@/hooks/useCybereatorOpened";
import { useCriteriaSets } from "@/hooks/useCriteria";
import type { CollectionFiguresSeed } from "@/lib/collectionFigures";
import { Fragment, use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { deployment } from "@/config/contracts";
import { useBestListings } from "@/hooks/useSeaportOrders";
import { toListing, type Listing } from "@/lib/seaport";
import { useGenericTokens } from "@/hooks/useGenericTokens";
import { useTokenIds } from "@/hooks/useTokenIds";
import { MintPanel } from "@/components/MintPanel";
import { useNarrow } from "@/hooks/useNarrow";
import { CollectionOffers, useCollectionOfferCount } from "@/components/CollectionOffers";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatCount } from "@/lib/format";
import { isFilterable } from "@/lib/traitRoles";
import "@/styles/home.css";
import "@/styles/collections.css";
import { Sortie } from "@/components/Sortie";
import { Select } from "@/components/Select";
import { Activity } from "@/components/Activity";
import { TopHolders } from "@/components/TopHolders";
import { CollectionHero } from "@/components/CollectionHero";
import { SealedNotice } from "@/components/Unrevealed";
import { CollectionStats } from "@/components/CollectionStats";
import { PageTabs, type TabDef } from "@/components/PageTabs";
import { KOLS_COLLECTION, offersAllowed } from "@/config/kols";
import { hasGenesisFrame } from "@/components/GenesisFrame";
import { useT } from "@/lib/i18n";

/** A translated sentence with `{name}` slots filled by elements, so bold figures land wherever the language puts them. */
/**
 * Calls `onMore` when its children come within a screen of view, and again
 * each time they return there. The button inside is the same action by hand,
 * for anyone whose browser does not report intersection.
 */
function MoreOnScroll({ onMore, children }: { onMore: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  more.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more.current();
    }, { rootMargin: "0px 0px 100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="coll-more coll-more-scroll">
      {children}
    </div>
  );
}

function richText(text: string, values: Record<string, ReactNode>): ReactNode[] {
  return text.split(/\{(\w+)\}/).map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{values[part] ?? `{${part}}`}</Fragment> : part));
}

/**
 * Any ERC-721 on ValueChain, not only ours.
 *
 * Reads through the plain ERC-721 interface rather than our collection's ABI, so
 * a contract written by somebody else works here as long as it is a real 721.
 * Enumeration is optional in the standard, so supply and token ids are probed
 * rather than assumed - a collection that lacks `totalSupply` still renders, just
 * without a grid.
 */
/**
 * Pieces per page, and per press of "Load more".
 *
 * Sixty fills three or four rows of a desktop grid, which is enough to show
 * what a collection looks like without reading the whole of it.
 */
const PAGE = 60;

/**
 * A collection at or under this size is drawn whole, with no "Load more".
 *
 * The page cap exists because every visitor's own browser walks the collection
 * — ids, then a `tokenURI` each, then a metadata document each — so a
 * thousand-piece contract would otherwise fire a thousand reads at anyone who
 * opened it. That reasoning is about big collections and was being applied to
 * every collection: ValueChain Genesis can never exceed 100 pieces, and its
 * holders were being asked to press a button to see the last nineteen of a
 * collection small enough to have been drawn in one go all along.
 *
 * A hundred rather than an address. Naming the collection here is the mistake
 * this page has made more than once, and a ceiling answers the actual question
 * — is this small enough to draw whole — for every collection rather than one.
 */
const WHOLE_COLLECTION_MAX = 100;

/**
 * Collections whose token number means something — a roster position, not a
 * mint time — so pieces with no price run from #1 up instead of newest first.
 *
 * Named in config, not here: this page has been bitten by naming collections
 * before. The KOL set is the case — #1 is the first person on the roster, and
 * the newest-first default opened the page on #37.
 */
const ROSTER_ORDERED = new Set([KOLS_COLLECTION]);

/**
 * The sections of a collection, as tabs rather than a stack.
 *
 * Activity and holders used to live in the sidebar beside the grid, in a panel
 * roughly 22rem wide, because there was nowhere else to put them. That is a
 * table of addresses and prices in a column narrow enough that every row
 * wrapped — and it pushed the mint panel, the one thing on the page with a
 * button, further from the top on every collection that was still minting.
 *
 * As tabs they get the page's full width and cost nothing when unopened: only
 * the selected one is rendered, so a visitor who never presses "Top holders"
 * never calls the explorer. See `PageTabs`.
 *
 * Offers joined them on 2026-11-10 (owner): the board used to sit above the
 * tabs on every visit, pushing the grid down the page whether or not anybody
 * was bidding.
 */
type Tab = "items" | "offers" | "activity" | "holders";

/** The server's copy of the header's basics; see page.tsx. Display only. */
export interface CollectionSeed {
  name?: string;
  symbol?: string;
  /** Pieces minted, as a decimal string (a bigint does not cross to the client). */
  minted?: string;
  /** Floor, listed and volumes, worked out on the server (lib/collectionFigures.ts). */
  figures?: CollectionFiguresSeed;
}

export function CollectionView({ params, seed }: { params: Promise<{ address: string }>; seed?: CollectionSeed }) {
  /* `tr`, not `t`: this component already calls each token `t`. */
  const tr = useT();
  const { address: raw } = use(params);
  const { address: viewer } = useAccount();

  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const collection = valid ? (raw as `0x${string}`) : undefined;

  const [chosenTab, setTab] = useState<Tab>("items");
  /* Collection offers, where this collection takes them; the KOL set does not. */
  const offersOk = collection !== undefined && offersAllowed(collection);
  /* Free: the order book the grid reads its prices from. Shown only above zero. */
  const offerCount = useCollectionOfferCount(offersOk ? collection : undefined);
  /* Never left on a tab this collection does not have. */
  const tab: Tab = chosenTab === "offers" && !offersOk ? "items" : chosenTab;
  // Matches `.coll-layout`'s single-column breakpoint in collections.css.
  const narrow = useNarrow(900);

  /**
   * One multicall for the four things everything else waits on.
   *
   * The hook is shared with the home page's background warmer, so that opening
   * a collection from there finds this already read — see hooks/useCollectionBasics.ts.
   */
  const { isErc721, name, symbol, supply, supplyKnown, probing } =
    useCollectionBasics(collection);
  /** For display only: the grid still waits for the live supply. */
  const seededSupply = seed?.minted !== undefined && /^\d+$/.test(seed.minted) ? BigInt(seed.minted) : undefined;
  const shownSupply = (supply as bigint | undefined) ?? seededSupply;

  /**
   * How much of the collection is on screen, and what "more" means.
   *
   * A page rather than the whole thing, because there is no index behind this
   * site: every visitor's own browser walks the collection, so a thousand-piece
   * contract would otherwise fire a thousand reads at anyone who opened it.
   *
   * Sixty was a hard cap, and an invisible one — Cybereator has 1,001 pieces
   * and this page drew sixty of them while saying nothing about the other 941.
   * It is a starting point now, and the line under the grid says what is left.
   */
  const [limit, setLimit] = useState(PAGE);

  /**
   * How many to actually ask for: the pressed limit, or the whole collection
   * when it is small enough to draw in one go.
   *
   * Derived rather than pushed into state with an effect, because `supply`
   * arrives a round trip after the first render — setting state when it lands
   * would render the page once at sixty and again at the full size, which is
   * the grid growing under somebody who has started reading it.
   *
   * `Math.max` so a press is never undone: on a big collection the reader can
   * still climb past the ceiling a page at a time.
   */
  const effectiveLimit =
    supply !== undefined && Number(supply) <= WHOLE_COLLECTION_MAX
      ? Math.max(limit, Number(supply))
      : limit;

  const {
    ids,
    isLoading: findingIds,
    isFetching: loadingMore,
  } = useTokenIds(collection, supply, effectiveLimit);

  /**
   * Listings for this collection, from the shared Seaport scan.
   *
   * This used to be one `getListing` call per id on screen - sixty reads to
   * discover that most of a collection is not for sale. Seaport announces each
   * order once, so the whole market is already in memory and this is a lookup.
   */
  const { best: bestListings } = useBestListings(collection);

  /** Which of this collection's pieces are for sale, whatever their id. */
  const listedIds = useMemo(() => {
    const prefix = `${(collection ?? "0x0").toLowerCase()}-`;
    const out: bigint[] = [];
    for (const key of bestListings.keys()) {
      if (key.startsWith(prefix)) out.push(BigInt(key.slice(prefix.length)));
    }
    return out;
  }, [bestListings, collection]);

  /**
   * The page's window, plus every listed piece whether or not it falls in it.
   *
   * Without the second half this page could not show its own market. The
   * window is the first `limit` ids the collection will name, which for a
   * contract without Enumerable is whatever the explorer lists first — the
   * newest. Cybereator has 1,427 pieces and six of them for sale at #1005,
   * #1051 and thereabouts; the window held #1427 down to #1368, so the page
   * reported "0 listed", drew "Not listed" on every card, and offered a
   * "Price low" sort over a set with no prices in it. The boxes did the same
   * at 8,230 minted and eight on sale.
   *
   * Reaching them by paging is not an answer: it is twenty-three presses of
   * Load more on Cybereator, and the pieces somebody came to buy are the last
   * thing they would find. The order book already names them exactly, so they
   * are simply added — a handful of extra reads, for the only pieces on the
   * page that can be acted on.
   */
  /**
   * Cybereator's reveal (2026-11-10): All · Opened · Sealed. Which pieces are
   * opened comes from the opener contract's own events, so the filter does not
   * depend on which cards happen to be loaded.
   */
  const isCybereator = (collection ?? "").toLowerCase() === CYBEREATOR;
  const [seal, setSeal] = useState<SealFilter>("opened");
  const opened = useCybereatorOpened(isCybereator);

  const shownIds = useMemo(() => {
    const seen = new Set(ids.map((id) => id.toString()));
    const out = [...ids];
    for (const id of listedIds) if (!seen.has(id.toString())) (seen.add(id.toString()), out.push(id));
    /* "Opened" shows every opened piece, not only those in the first window. */
    if (seal === "opened" && opened !== undefined) {
      for (const id of opened) if (!seen.has(id)) (seen.add(id), out.push(BigInt(id)));
    }
    return out;
  }, [ids, listedIds, seal, opened]);

  /**
   * Only while the items tab is open.
   *
   * This is the ladder that makes a collection page slow — ids, then a
   * `tokenURI` each, then a metadata document each — and somebody who opened
   * the page to read its history has no use for any of it. The order book
   * above is deliberately NOT gated the same way: the stats bar shows the
   * floor on every tab, and it is one shared scan either way.
   */
  /* Cheapest first by default: on a marketplace the first question is "what
     can I buy, and for how little". Unlisted pieces follow, newest first, so
     a collection with nothing for sale reads exactly as it did before. */
  const [sort, setSort] = useState<"id-desc" | "id-asc" | "price-asc" | "price-desc">("price-asc");
  const [traitFilter, setTraitFilter] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  /** Whether any trait filter is narrowing the grid right now. */
  const filtering = Object.values(traitFilter).some((v) => v !== "");

  /**
   * The grid in its final order, before any document is read (2026-11-10).
   *
   * The Opened / Sealed filter and every sort need only the opened list and
   * the order book, so the order is settled here from ids alone. That is what
   * lets the page read and draw a page at a time: with "Opened" adding every
   * opened Cybereator (350 and climbing), it used to fetch every document and
   * draw every card at once, and each arriving document re-rendered them all.
   */
  const orderedIds = useMemo(() => {
    const prefix = `${(collection ?? "0x0").toLowerCase()}-`;
    const priceOf = (id: bigint) => bestListings.get(`${prefix}${id}`)?.priceWei;
    const rosterOrder = ROSTER_ORDERED.has((collection ?? "").toLowerCase());
    const rows = shownIds.filter(
      (id) => seal === "all" || (opened !== undefined && (seal === "opened") === opened.has(id.toString())),
    );
    return rows.sort((a, b) => {
      if (sort === "id-asc") return a < b ? -1 : a > b ? 1 : 0;
      if (sort === "id-desc") return a > b ? -1 : a < b ? 1 : 0;
      const pa = priceOf(a);
      const pb = priceOf(b);
      /**
       * Unlisted tokens sort last in both price directions, never first.
       * Treating "no price" as zero would put everything unlisted at the top
       * of "price low", which is the opposite of what the control promises.
       */
      if (pa === undefined && pb === undefined) {
        if (rosterOrder) return a < b ? -1 : 1;
        return a > b ? -1 : 1;
      }
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      const n = pa < pb ? -1 : pa > pb ? 1 : 0;
      return sort === "price-asc" ? n : -n;
    });
  }, [shownIds, seal, opened, sort, bestListings, collection]);

  /** How many cards are drawn; grows a page at a time as the reader scrolls. */
  const [visible, setVisible] = useState(PAGE);
  const viewKey = `${seal}|${sort}|${JSON.stringify(traitFilter)}`;
  const [lastViewKey, setLastViewKey] = useState(viewKey);
  if (lastViewKey !== viewKey) {
    /* A new view starts at its first page (set during render: no flash of the old count). */
    setLastViewKey(viewKey);
    setVisible(PAGE);
  }

  /**
   * Which documents to read: the cards about to be drawn, or, while a trait
   * filter is set, every candidate (matching needs their traits).
   *
   * Append-only. `useGenericTokens` reads token URIs as one list and keeps the
   * previous answer while a longer one loads, matched by position, so the list
   * it is given must only ever grow at the end. Reordering it would pair cards
   * with another piece's URI for a moment.
   */
  const requested = useRef<{ key: string; ids: bigint[]; seen: Set<string> }>({ key: "", ids: [], seen: new Set() });
  const docIds = useMemo(() => {
    const key = (collection ?? "").toLowerCase();
    if (requested.current.key !== key) requested.current = { key, ids: [], seen: new Set() };
    const want = filtering ? orderedIds : orderedIds.slice(0, visible);
    const r = requested.current;
    let grew = false;
    for (const id of want) {
      const k = id.toString();
      if (!r.seen.has(k)) (r.seen.add(k), r.ids.push(id), (grew = true));
    }
    if (grew) r.ids = [...r.ids];
    return r.ids;
  }, [collection, orderedIds, visible, filtering]);

  const { tokens, isLoading } = useGenericTokens(collection, tab === "items" ? docIds : []);

  /**
   * Sorting and trait filtering.
   *
   * The collection page had neither - no controls of any kind - which is
   * fine at nine tokens and useless at ninety. Both work off metadata that
   * is already loaded for the cards, so neither costs a request.
   *
   * Traits are read from the tokens themselves rather than a fixed list.
   * Collections here disagree about what they publish - some have Tier and
   * Design, an external one may have neither - and a hardcoded set would
   * show empty filters for half of them.
   */
  const listings = new Map<string, Listing>();
  for (const id of shownIds) {
    const order = bestListings.get(`${(collection ?? "0x0").toLowerCase()}-${id}`);
    if (order !== undefined) listings.set(id.toString(), toListing(order));
  }

  /** Every trait this collection actually publishes, with value counts. */
  const traitOptions = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const t of tokens) {
      for (const a of t.metadata?.attributes ?? []) {
        if (a.trait_type === undefined || a.value === undefined) continue;
        /**
         * Not every attribute is an axis. `/api/metadata` emits four — Design,
         * Tier, Edition and Editions Minted — and this row was drawing a
         * dropdown for each of them, because "has more than one value" was the
         * only question being asked. Two of the four answer a question nobody
         * has: `Editions Minted` is the number the Rarity cell is computed
         * from, and `Edition` is a serial whose values run across designs. See
         * `lib/traitRoles.ts`.
         */
        if (!isFilterable(a.trait_type)) continue;
        const value = String(a.value);
        const inner = out.get(a.trait_type) ?? new Map<string, number>();
        inner.set(value, (inner.get(value) ?? 0) + 1);
        out.set(a.trait_type, inner);
      }
    }
    /**
     * A trait with one value describes every token, so filtering on it is a
     * no-op. Dropping those keeps the row to the traits that separate things.
     */
    return [...out.entries()].filter(([, values]) => values.size > 1);
  }, [tokens]);

  /**
   * Cybereator's rarity levels, lowest first, with counts.
   *
   * Counted over every opened piece by the server (the same sets the offer box
   * uses), not over the cards read so far: the grid reads a page at a time, so
   * a count from loaded cards said "Epic 6" when there were 16.
   */
  const criteria = useCriteriaSets(isCybereator ? (collection as `0x${string}`) : undefined);
  const rarityOptions = useMemo(() => {
    const fromServer = criteria.sets.filter((s) => s.traitType === "Rarity" && s.value !== "Any");
    const levels =
      fromServer.length > 0
        ? new Map(fromServer.map((s) => [s.value, s.count]))
        : traitOptions.find(([type]) => type === "Rarity")?.[1];
    if (levels === undefined) return [];
    const rank = (v: string) => {
      const i = (CYBEREATOR_LEVELS as readonly string[]).indexOf(v);
      return i === -1 ? CYBEREATOR_LEVELS.length : i;
    };
    return [...levels.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [traitOptions, criteria.sets]);

  /**
   * Every piece in this view, in order: all candidates unfiltered, or those
   * whose traits match. Only the first `visible` are drawn (`rendered`).
   */
  const shown = useMemo(() => {
    const active = Object.entries(traitFilter).filter(([, v]) => v !== "");
    const byId = new Map(tokens.map((t) => [t.id.toString(), t]));
    const out: typeof tokens = [];
    for (const id of orderedIds) {
      const t = byId.get(id.toString());
      if (t === undefined) {
        /* Not read yet: only possible beyond the drawn page when unfiltered. */
        if (active.length === 0) out.push({ id });
        continue;
      }
      if (active.every(([type, value]) => (t.metadata?.attributes ?? []).some((a) => a.trait_type === type && String(a.value) === value))) {
        out.push(t);
      }
    }
    return out;
  }, [tokens, orderedIds, traitFilter]);
  const rendered = shown.slice(0, visible);
  const moreToDraw = shown.length > visible;

  if (!valid) {
    return (
      <section className="page section market-empty">
        <h2>{tr("That isn’t a contract address.")}</h2>
        <p className="muted">{tr("A ValueChain address is 0x followed by 40 characters.")}</p>
        <Link className="btn" href="/collections">
          {tr("Back to collections")}
        </Link>
      </section>
    );
  }

  if (!probing && isErc721 !== true) {
    return (
      <section className="page section market-empty">
        <h2>{tr("Nothing tradeable at that address.")}</h2>
        <p className="muted">
          {tr("It doesn’t answer as an ERC-721, so this marketplace can’t move its tokens. ERC-1155 collections exist on ValueChain but aren’t supported here yet.")}
        </p>
        <div className="wrap-row mt-sm">
          <a
            className="btn"
            href={`${deployment.explorer}/address/${raw}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {tr("Inspect it on the explorer")}
          </a>
          <Link className="btn" href="/collections">
            {tr("Back to collections")}
          </Link>
        </div>
      </section>
    );
  }

  /**
   * Only items and offers carry a count, and that is not an omission.
   *
   * A count on the other two would have to be fetched to be drawn, which means
   * calling the explorer and reading the history for a tab nobody has opened —
   * paying the whole cost of a tab to print its size next to its name. Supply
   * is already on screen in the stats bar above, so the items count is free,
   * and the offers count comes from the order book the grid has already read.
   */
  const tabs: ReadonlyArray<TabDef<Tab>> = [
    { key: "items", label: tr("Items"), ...(supply === undefined ? {} : { count: Number(supply) }) },
    ...(offersOk
      ? [{ key: "offers" as const, label: tr("Offers"), ...(offerCount === undefined || offerCount === 0 ? {} : { count: offerCount }) }]
      : []),
    { key: "activity", label: tr("Activity") },
    { key: "holders", label: tr("Top holders") },
  ];

  return (
    <section className="page section page-compact">
      {/*
        The live read where it has landed, the server's copy until then
        (page.tsx), so the header and the listed share draw with the page.
      */}
      <CollectionHero
        address={raw as `0x${string}`}
        {...((name ?? seed?.name) === undefined ? {} : { name: (name ?? seed?.name) as string })}
        {...((symbol ?? seed?.symbol) === undefined ? {} : { symbol: (symbol ?? seed?.symbol) as string })}
        supply={shownSupply}
      />

      <CollectionStats
        collection={collection}
        supply={shownSupply}
        {...(seed?.figures === undefined ? {} : { seed: seed.figures })}
      />

      {/* On a phone the mint card leads, above the tabs, where it is the
          page's one primary action; on a desktop it stays in the sidebar. */}
      {narrow && collection !== undefined ? (
        <div className="coll-mint-top">
          <MintPanel address={collection} />
        </div>
      ) : null}

      <PageTabs tabs={tabs} active={tab} onChange={setTab} label={tr("Collection sections")} />

      {tab === "offers" && collection !== undefined ? (
        /* Bids on the whole collection or one trait, and the way to place one. */
        <CollectionOffers collection={collection} />
      ) : tab === "activity" ? (
        /* The page's full width, and more rows than a sidebar could hold. */
        <Activity collection={collection} limit={25} markBurned />
      ) : tab === "holders" ? (
        <TopHolders collection={collection} supply={supply as bigint | undefined} />
      ) : (
        <>
          <SealedNotice collection={collection} />

          {/*
            Drawn as soon as the collection is known to have more than one piece,
            which is two round trips before the pieces themselves arrive.

            This was gated on `tokens.length > 1`, and `tokens` is the end of the
            ladder: ids, then tokenURIs, then a metadata document each. So the sort
            row appeared seconds after the header above it and shoved the whole grid
            down at the moment somebody had started reading it.

            `supply` comes back in the first multicall, alongside the name and
            symbol already on screen, and answers the same question — is there more
            than one thing here to sort. Until it lands the row is drawn anyway, on
            the assumption that a collection has more than one piece, because nearly
            every one does and being wrong costs a row disappearing on a page with a
            single token on it.
          */}
          {/* Not for a roster-ordered set like the KOLs: its order IS the
              content (#1 first), there are no prices to sort by, and its
              traits describe nobody in particular. */}
          {(supply ?? 2n) > 1n && !ROSTER_ORDERED.has((collection ?? "").toLowerCase()) ? (
            <div className="coll-controls">
              {isCybereator ? (
                <div className="wrap-row" role="group" aria-label={tr("Opened or sealed")}>
                  <Sortie active={seal === "all"} onClick={() => setSeal("all")}>
                    {tr("All")}
                  </Sortie>
                  <Sortie active={seal === "opened"} onClick={() => setSeal("opened")} tone="opened">
                    {tr("Opened")}{opened === undefined ? "" : ` ${opened.size.toLocaleString()}`}
                  </Sortie>
                  <Sortie active={seal === "sealed"} onClick={() => setSeal("sealed")} tone="sealed">
                    {tr("Sealed")}
                    {opened === undefined || supply === undefined
                      ? ""
                      : ` ${Math.max(0, Number(supply) - opened.size).toLocaleString()}`}
                  </Sortie>
                </div>
              ) : null}
              <div className="wrap-row">
                {/* The default first, so the selected pill leads the row. */}
                <Sortie active={sort === "price-asc"} onClick={() => setSort("price-asc")}>
                  {tr("Price low")}
                </Sortie>
                <Sortie active={sort === "price-desc"} onClick={() => setSort("price-desc")}>
                  {tr("Price high")}
                </Sortie>
                <Sortie active={sort === "id-desc"} onClick={() => setSort("id-desc")}>
                  {tr("Newest")}
                </Sortie>
                <Sortie active={sort === "id-asc"} onClick={() => setSort("id-asc")}>
                  {tr("Oldest")}
                </Sortie>
              </div>

              {/*
                Trait filters behind one button (owner, 2026-11-10). A revealed
                Cybereator has up to ten traits, and ten dropdowns above the
                grid pushed the pieces themselves off the first screen.
              */}
              {/*
                Cybereator: one Rarity dropdown and nothing else (owner,
                2026-11-10). Price follows rarity; the parts are on each
                piece's page.
              */}
              {isCybereator && rarityOptions.length > 0 ? (
                <div className="coll-trait">
                  <span className="coll-trait-label">{tr("Rarity")}</span>
                  <Select
                    label={tr("Rarity")}
                    value={traitFilter.Rarity ?? ""}
                    onChange={(v) => setTraitFilter(v === "" ? {} : { Rarity: v })}
                    options={[
                      { value: "", label: tr("All rarities") },
                      ...rarityOptions.map(([value, count]) => ({ value, label: tr(value), note: String(count) })),
                    ]}
                  />
                </div>
              ) : null}

              {traitOptions.length > 0 && !isCybereator ? (
                <button
                  type="button"
                  className="filt"
                  aria-expanded={advanced}
                  aria-controls="coll-advanced"
                  onClick={() => setAdvanced((open) => !open)}
                >
                  {tr("Advanced filters")}
                  {filtering ? <em>{Object.values(traitFilter).filter((v) => v !== "").length}</em> : null}
                </button>
              ) : null}

              {traitOptions.length > 0 && advanced && !isCybereator ? (
                <div className="coll-traits coll-advanced" id="coll-advanced">
                  {traitOptions.map(([type, values]) => (
                    <div key={type} className="coll-trait">
                      <span className="coll-trait-label" id={`trait-${type}`}>
                        {type}
                      </span>
                      {/* The count moves out of the label and into `note`, so it
                          stays dim and column-aligned instead of being glued to the
                          value as "VELOCITY (9)". */}
                      <Select
                        label={type}
                        value={traitFilter[type] ?? ""}
                        onChange={(v) => setTraitFilter((f) => ({ ...f, [type]: v }))}
                        options={[
                          { value: "", label: tr("Any") },
                          ...[...values.entries()]
                            .sort((a, b) => b[1] - a[1])
                            .map(([value, count]) => ({
                              value,
                              label: value,
                              note: String(count),
                            })),
                        ]}
                      />
                    </div>
                  ))}

                  {Object.values(traitFilter).some((v) => v !== "") ? (
                    <button type="button" className="filt" onClick={() => setTraitFilter({})}>
                      {tr("Clear")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="coll-layout">
            <div className="coll-layout-main">
              {supplyKnown && supply === undefined ? (
                <div className="market-empty">
                  <h3>{tr("This collection doesn’t publish a token list.")}</h3>
                  <p className="muted">
                    {tr("It’s a valid ERC-721 and its tokens can still be traded, but it doesn’t implement the optional Enumerable extension, so there’s no way to walk its contents from the chain alone. Open a token directly if you know its id.")}
                  </p>
                </div>
              ) : (!supplyKnown || isLoading || findingIds) && tokens.length === 0 ? (
                <div className="grid-tokens">
                  {Array.from({ length: 8 }, (_, i) => (
                    <TokenCardSkeleton key={i} />
                  ))}
                </div>
              ) : shown.length === 0 ? (
                /*
                  Three different nothings, and they used to share one sentence.

                  "Nothing matches those traits. Clear a filter to widen the search."
                  was shown whenever the grid came out empty — including when no filter
                  was set, which is every empty collection. The trait row is built from
                  the tokens that loaded, so an empty collection has no filters at all:
                  the page was telling people to clear a control that was not on screen.

                  Seen on SoDEXTreasureBox the day its boxes were opened. Opening one
                  burns it, all 21 went, and `totalSupply` fell to 0 — so the page
                  offered a filter to clear on a collection with nothing in it.
                */
                filtering ? (
                  <div className="market-empty">
                    <h3>{tr("Nothing matches those traits.")}</h3>
                    <p className="muted">{tr("Clear a filter to widen the search.")}</p>
                  </div>
                ) : supply === 0n ? (
                  <div className="market-empty">
                    <h3>{tr("This collection is empty.")}</h3>
                    {/*
                      Both halves, because `totalSupply` cannot tell them apart: it
                      counts what exists now, not what has ever existed. A collection
                      nobody has minted from and one whose every piece has been burned
                      both read 0, and claiming "none minted yet" to the second would
                      be wrong in front of somebody who minted them.
                    */}
                    <p className="muted">
                      {tr("Nothing has been minted yet — or everything that was has since been burned.")}
                    </p>
                  </div>
                ) : (
                  <div className="market-empty">
                    {/*
                      Supply says there are pieces and we could not find their ids. For
                      a collection without Enumerable that means the explorer's index
                      is the only route to them and it did not answer, which is a
                      failure to read rather than a collection with nothing in it.
                    */}
                    <h3>{tr("Couldn’t list this collection’s pieces.")}</h3>
                    <p className="muted">
                      {tr("It reports {count} minted, but the token list could not be read just now. Try again shortly, or open a piece directly if you know its id.", { count: formatCount(supply as bigint | undefined) })}
                    </p>
                  </div>
                )
              ) : (
                <div className="grid-tokens">
                  {rendered.map((t, i) => (
                    <TokenCard
                      key={t.id.toString()}
                      token={t}
                      collection={collection!}
                      collectionName={name}
                      listing={listings.get(t.id.toString())}
                      viewerAddress={viewer}
                      /*
                        The first row loads eagerly.

                        `next/image` is lazy by default, and measured on this page that
                        meant 0 of 60 images began fetching when their src was set —
                        every one waited on an intersection callback, on the row already
                        filling the screen. The home page marks its first four; this
                        page never did.
                      */
                      priority={i < 4}
                      framed={hasGenesisFrame(collection)}
                    />
                  ))}
                </div>
              )}

              {/* The next page of this view, drawn as the reader nears the end of this one. */}
              {moreToDraw ? (
                <MoreOnScroll onMore={() => setVisible((n) => n + PAGE)}>
                  <button type="button" className="btn" onClick={() => setVisible((n) => n + PAGE)}>
                    {tr("Show {count} more", { count: Math.min(PAGE, shown.length - visible) })}
                  </button>
                </MoreOnScroll>
              ) : null}

              {/*
                What is on screen, and the way to get more of it.

                `ids.length >= limit` is the test for "there is more", and it is doing
                real work: if a press comes back with fewer ids than were asked for,
                the source has given everything it has and the button takes itself
                away. Comparing against `supply` alone would leave it sitting there
                doing nothing for a collection whose explorer index is short of its own
                `totalSupply` — which is exactly the case this page already has a
                paragraph about.

                The count is shown whenever the grid is not the whole collection, with
                or without a button under it, because the sixty-card cap used to be
                completely silent and that was the worse half of the problem.
              */}
              {supply !== undefined && ids.length > 0 && ids.length < Number(supply) ? (
                <div className="coll-more">
                  <p className="coll-more-count">
                    {/*
                      Two different sentences, because a filter changes what the
                      numbers mean. Unfiltered, the grid is the first N of the
                      collection. Filtered, the grid is what matched *within* the first
                      N — and saying "12 of 1,001" there would imply the other 989 had
                      been looked at and rejected, when most of them have not been read
                      at all. That is the single most misleading thing this line could
                      do, so it says outright how far the search got.
                    */}
                    {filtering ? (
                      <>
                        {richText(tr("Searched {searched} of {total} — {matched} match so far"), {
                          searched: <b>{formatCount(BigInt(ids.length))}</b>,
                          total: <b>{formatCount(supply as bigint)}</b>,
                          matched: <b>{formatCount(BigInt(shown.length))}</b>,
                        })}
                      </>
                    ) : (
                      <>
                        {tr("Showing")} <b>{formatCount(BigInt(shown.length))}</b> {tr("of")}{" "}
                        <b>{formatCount(supply as bigint)}</b>
                      </>
                    )}
                  </p>
                  {ids.length >= effectiveLimit ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setLimit((n) => n + PAGE)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? tr("Loading…") : tr("Load {count} more", { count: PAGE })}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/*
              The sidebar holds one thing now.

              It used to hold the mint panel and the history panel, and it had to
              wrap them in a single element: a two-column grid auto-places a third
              child in row two, column one, so the history landed underneath the
              entire sixty-card grid. The history is a tab of its own now, so the
              wrapper has one occupant — kept, because `.coll-side` is what gives
              the column its width and its phone behaviour.
            */}
            {collection !== undefined && !narrow ? (
              <aside className="coll-side">
                <MintPanel address={collection} />
              </aside>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
