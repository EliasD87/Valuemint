"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useMyPieces } from "@/hooks/useMyPieces";
import { useCollectionOffers, useTraitOffers } from "@/hooks/useSeaportOrders";
import { boundsOf, fetchMemberRoots, rootKey, traitLabel, useCriteriaSets, type TraitSetSummary } from "@/hooks/useCriteria";
import { OfferForm, useCollectionOfferTarget } from "@/components/OfferForm";
import { Select } from "@/components/Select";
import { Soso } from "@/components/Soso";
import { formatSoso } from "@/lib/format";
import { OPENED_ZONE, SEALED_ZONE, currencyLabel, remainingPieces, type SeaportOrder } from "@/lib/seaport";
import { SellIntoOffer } from "@/components/SellIntoOffer";
import { useT } from "@/lib/i18n";
import { CYBEREATOR } from "@/lib/cybereator";
import { useAnyPieceApplies } from "@/hooks/useCybereatorOpened";
import { CYBEREATOR_LEVELS } from "@/lib/cybereatorRarity";
import "./OfferDialog.css";
import "./CollectionOffers.css";

/**
 * Offers on a collection, not on one piece: "any piece", or every piece with
 * one trait (2026-09-25).
 *
 * A bid on one piece makes a buyer who would take any of them bid again and
 * again. A collection offer is one bid any holder can accept; a trait offer is
 * one bid only holders of that trait can — enforced by Seaport against the
 * set's Merkle root, not by this page. A Common holder cannot sell into an
 * Uncommon offer whatever they click.
 */
/**
 * The offers the board shows: bids on the collection as a whole, and trait
 * bids on a set this page recognises. One place for both the board and the
 * count on its tab, so the two cannot disagree.
 *
 * Costs nothing the page was not already paying: the order book is the one
 * the grid reads its prices from, and the trait sets are one cached request.
 */
function useStandingOffers(collection: `0x${string}` | undefined) {
  const { offers: all, isLoading: loadingOffers } = useCollectionOffers(collection);
  const { offers: traitOffers } = useTraitOffers(collection);
  /* Asked for the snapshots standing offers were made at too, or an offer made
     before the latest mint on a growing collection would not be recognised. */
  const criteria = useCriteriaSets(collection, boundsOf(traitOffers));

  /** Only bids on the collection as a whole: the list above also holds bids on single pieces. */
  const anyPiece = all.filter((o) => o.tokenId === undefined);

  /** Only trait offers whose root is a set we recognise; anything else is not shown. */
  const traits = traitOffers.flatMap((o) => {
    const set = o.criteria === undefined ? undefined : criteria.byRoot.get(rootKey(o.criteria));
    return set === undefined ? [] : [{ offer: o, set }];
  });

  return { anyPiece, traits, traitOffers, criteria, loadingOffers };
}

/**
 * How many offers the board holds, for the count on its tab; undefined while
 * the order book is still being read. Pass undefined where offers are off.
 */
export function useCollectionOfferCount(collection: `0x${string}` | undefined): number | undefined {
  const { anyPiece, traits, loadingOffers } = useStandingOffers(collection);
  if (collection === undefined || loadingOffers) return undefined;
  return anyPiece.length + traits.length;
}

/**
 * "Make an offer" on the collection, and the dialog it opens.
 *
 * Its own component so the collection header can carry one too (owner,
 * 2026-11-11): with the board behind the Offers tab, a bidder should not have
 * to find the tab to bid. The trait sets are the board's own request, shared
 * through its cache, so a second button asks nothing more.
 */
export function MakeCollectionOffer({ collection }: { collection: `0x${string}` }) {
  const tr = useT();
  const { offers: traitOffers } = useTraitOffers(collection);
  const criteria = useCriteriaSets(collection, boundsOf(traitOffers));
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        {tr("Make an offer")}
      </button>
      {open ? (
        <CollectionOfferDialog
          collection={collection}
          supported={criteria.supported}
          hasTraits={criteria.supported && criteria.sets.length > 0}
          traitsFailed={criteria.isError}
          loadingTraits={criteria.isLoading}
          sets={criteria.sets}
          bound={criteria.bound}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function CollectionOffers({ collection }: { collection: `0x${string}` }) {
  /* `tr`, not `t`: this file already names trait rows `t`. */
  const tr = useT();
  const { anyPiece, traits, traitOffers, criteria, loadingOffers } = useStandingOffers(collection);

  /**
   * A way to take an offer from here: the viewer's own piece that qualifies,
   * linked to its page, where accepting happens with the proof it needs.
   *
   * Only asked when something is standing and a wallet is connected — the
   * holdings read is the portfolio's, shared through its cache. A trait offer
   * needs a piece IN its set, checked with the same batched lookup the cards
   * use; never the bidder's own offer.
   */
  const { address } = useAccount();
  const isMine = (o: SeaportOrder) => address !== undefined && o.maker.toLowerCase() === address.toLowerCase();
  const somethingStanding = anyPiece.length > 0 || traits.length > 0;

  /**
   * Whether this collection has traits to offer on. Where it does, "any piece"
   * is not offered: a bid meant for the good ones, made as "any piece", is
   * filled with the cheapest piece in the collection — the owner's point,
   * 2026-09-26, that this would go wrong for people new to it.
   */
  const hasTraits = criteria.supported && criteria.sets.length > 0;
  /* This collection only — see useMyPieces for why not the whole wallet. */
  const { ids: myIds, holds, checking: checkingPieces } = useMyPieces(collection, address, somethingStanding);
  const bounds = boundsOf(traitOffers);
  const memberships = useQueries({
    queries: (traits.length > 0 ? myIds : []).map((id) => ({
      queryKey: ["criteria-member", collection.toLowerCase(), id.toString(), bounds.join(",")],
      staleTime: 5 * 60_000,
      queryFn: () => fetchMemberRoots(collection, id, bounds),
    })),
  });
  const checkingTraits = memberships.some((q) => q.isLoading);
  /* On Cybereator, never suggest selling an opened piece into an "any piece" bid. */
  const anyApplies = useAnyPieceApplies(collection);
  const pieceFor = (o: SeaportOrder): bigint | undefined => piecesFor(o)[0];
  /** Every piece the viewer holds that this offer can take. */
  const piecesFor = (o: SeaportOrder): bigint[] => {
    if (isMine(o)) return [];
    if (o.criteria === undefined || o.criteria === 0n) return myIds.filter((id) => anyApplies(id, undefined, o.openedOnly === true));
    const key = rootKey(o.criteria);
    return myIds.filter((_, n) => memberships[n]?.data?.has(key) === true);
  };
  /** A batch offer the viewer could sell several pieces into, in one go. */
  const [selling, setSelling] = useState<{ offer: SeaportOrder; label: string } | undefined>(undefined);
  /**
   * Accept, or — while the viewer's pieces are still being checked — a small
   * spinner in its place, so the button does not pop in beside an offer that
   * has been on screen for seconds.
   */
  const accept = (o: SeaportOrder, label: string) => {
    if (address === undefined || isMine(o)) return null;
    const trait = o.criteria !== undefined && o.criteria !== 0n;
    /*
      Any piece needs only to know the viewer holds one — one read — so Accept
      shows at once and, until the ids are known, opens the portfolio, where
      the offer is waiting against a piece. A trait offer needs the ids and the
      set, so it waits for them.
    */
    if (!trait && myIds.length === 0 && holds === true) {
      return (
        <Link className="btn btn-sm co-accept" href="/portfolio" title={tr("Accept from your portfolio")}>
          {tr("Accept")}
        </Link>
      );
    }
    if (checkingPieces || (trait && checkingTraits)) {
      return <span className="co-accept-wait" role="status" aria-label={tr("Checking your pieces")} />;
    }
    /*
      A batch offer that wants more than one, and a viewer with more than one
      piece it can take: sell several at once, from here, in one transaction.
      Anything less is the single accept on the piece's own page, as before.
    */
    const eligible = piecesFor(o);
    if (o.amount > 1n && remainingPieces(o) > 1n && eligible.length > 1) {
      const most = Math.min(eligible.length, Number(remainingPieces(o)));
      return (
        <button type="button" className="btn btn-sm co-accept" onClick={() => setSelling({ offer: o, label })}>
          {tr("Sell up to {count}", { count: most })}
        </button>
      );
    }
    const id = pieceFor(o);
    return id === undefined ? null : (
      <Link
        className="btn btn-sm co-accept"
        href={`/token/${collection}/${id.toString()}`}
        title={tr("Accept on your #{id}", { id: id.toString() })}
      >
        {tr("Accept")}
      </Link>
    );
  };

  /**
   * The board: one row per thing an offer is for — "Any piece", or one trait
   * value — with the best price and how many stand behind it.
   *
   * It used to print each offer on its own: on Treasure Box that read "Level:
   * Common 5 WSOSO" three times, then "+6 more trait offers" (2026-09-28).
   * Offers on the same trait are one row now however many there are, and a
   * trait on a growing collection is one row across every snapshot it was
   * offered at.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; type?: string; value: string; offers: SeaportOrder[] }>();
    /* An Unopened offer (sealedOnly) is its own row: it is not "any piece". */
    const unopenedOffers = anyPiece.filter((o) => o.sealedOnly === true);
    const anyOpenedOffers = anyPiece.filter((o) => o.openedOnly === true);
    const plainOffers = anyPiece.filter((o) => o.sealedOnly !== true && o.openedOnly !== true);
    if (plainOffers.length > 0) byKey.set("any", { key: "any", value: "Any piece", offers: plainOffers });
    if (unopenedOffers.length > 0) byKey.set("unopened", { key: "unopened", value: "Unopened", offers: unopenedOffers });
    if (anyOpenedOffers.length > 0) byKey.set("anyopened", { key: "anyopened", value: "Any opened", offers: anyOpenedOffers });
    for (const { offer, set } of traits) {
      const key = traitLabel(set);
      const g = byKey.get(key) ?? { key, type: set.traitType, value: set.value, offers: [] };
      g.offers.push(offer);
      byKey.set(key, g);
    }
    const desc = (a: SeaportOrder, b: SeaportOrder) => (b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0);
    const list = [...byKey.values()].map((g) => ({ ...g, offers: g.offers.sort(desc) }));
    return list.sort((a, b) => desc(a.offers[0]!, b.offers[0]!));
  }, [anyPiece, traits]);

  const count = groups.reduce((n, g) => n + g.offers.length, 0);
  const best = groups[0]?.offers[0];

  /** The best offer in a group this viewer could take, else the best one there. */
  const takeable = (offers: SeaportOrder[]) =>
    offers.find((o) => !isMine(o) && pieceFor(o) !== undefined) ?? offers.find((o) => !isMine(o));

  return (
    <section className="co" aria-label={tr("Collection offers")}>
      <div className="co-head">
        <div className="co-title">
          <span className="co-eyebrow">{tr("Collection offers")}</span>
          <span className="co-sub">
            {count > 0 && best !== undefined ? (
              <>
                {count === 1 ? tr("1 offer") : tr("{count} offers", { count })} · {tr("best")}{" "}
                <Soso size={12} unit={currencyLabel(best.currency)}>
                  {formatSoso(best.priceWei)}
                </Soso>
              </>
            ) : loadingOffers ? (
              <span className="co-checking" role="status">
                <span className="co-accept-wait" aria-hidden="true" />
                {tr("Checking offers…")}
              </span>
            ) : hasTraits ? (
              tr("None yet. Offer on a trait and every holder of it can accept.")
            ) : (
              tr("None yet. Offer on the collection and any holder can accept.")
            )}
          </span>
        </div>
        <MakeCollectionOffer collection={collection} />
      </div>

      {groups.length === 0 ? null : (
        <ul className="co-board">
          {groups.map((g) => {
            const top = g.offers[0]!;
            const target = takeable(g.offers);
            return (
              <li key={g.key} className="co-row">
                <span className="co-what">
                  {g.type === undefined ? null : <span className="co-type">{g.type}</span>}
                  <b>{g.type === undefined ? tr(g.value) : g.value}</b>
                </span>
                <span className="co-count">{wantedLabel(g.offers, tr)}</span>
                <span className="co-best">
                  <Soso size={14} unit={currencyLabel(top.currency)}>
                    {formatSoso(top.priceWei)}
                  </Soso>
                </span>
                <span className="co-act">{target === undefined ? null : accept(target, g.type === undefined ? tr(g.value) : `${g.type}: ${g.value}`)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {selling !== undefined ? (
        <SellIntoOffer
          collection={collection}
          offer={selling.offer}
          eligible={piecesFor(selling.offer)}
          bounds={bounds}
          label={selling.label}
          onClose={() => setSelling(undefined)}
        />
      ) : null}

    </section>
  );
}

/**
 * The trait that says how rare a piece is leads. Alphabetical order opened
 * Genesis on "Design" — the artwork's name — when what a bidder means by a
 * trait offer is almost always its tier.
 */
const RARITY_FIRST = ["tier", "level", "rarity", "depth"];

/** The rarity dropdown's value for Cybereator's "Unopened"; no trait value looks like it. */
const UNOPENED = "__unopened__";
/** The same for "Any opened" (OpenedOnlyZone). */
const ANY_OPENED = "__anyopened__";
const traitRank = (t: string) => {
  const i = RARITY_FIRST.indexOf(t.toLowerCase());
  return i === -1 ? RARITY_FIRST.length : i;
};

/** A known ladder in its own order (Common up to Legendary); anything else most common first. */
const LADDER: readonly string[] = [...CYBEREATOR_LEVELS, "SuperRare"];
const ladderOrder = (a: TraitSetSummary, b: TraitSetSummary) => {
  const i = LADDER.indexOf(a.value);
  const j = LADDER.indexOf(b.value);
  return i !== -1 && j !== -1 ? i - j : b.count - a.count;
};

function CollectionOfferDialog({
  collection,
  supported,
  hasTraits,
  traitsFailed,
  loadingTraits,
  sets,
  bound,
  onClose,
}: {
  collection: `0x${string}`;
  supported: boolean;
  /** The collection has trait sets: offers are by trait only. */
  hasTraits: boolean;
  /** The trait lookup failed: offer nothing rather than fall back to "any piece". */
  traitsFailed: boolean;
  loadingTraits: boolean;
  sets: TraitSetSummary[];
  /** On a growing collection, the highest token id the sets cover. */
  bound: bigint | undefined;
  onClose: () => void;
}) {
  /* `tr`, not `t`: the trait pickers below call their argument `t`. */
  const tr = useT();
  /* Never "any" on a collection with traits, and nothing at all until that is known. */
  const scope: "any" | "trait" = hasTraits ? "trait" : "any";
  const undecided = loadingTraits || traitsFailed;

  /** Cybereator's bound counts openings, not minted ids (lib/cybereatorSets.ts). */
  const opened = collection.toLowerCase() === CYBEREATOR;

  const types = useMemo(
    () => [...new Set(sets.map((s) => s.traitType))].sort((a, b) => traitRank(a) - traitRank(b)),
    [sets],
  );
  /*
    The rarity ladder (Rarity, Tier, Level) is what most bidders mean, so a
    collection that has one is offered on it alone, through one dropdown.
    The "Advanced filters" behind it, any other single trait, went at the
    owner's request (2026-11-10). A collection with no ladder still picks a
    trait and a value.
  */
  const ladderType = types.find((t) => traitRank(t) < RARITY_FIRST.length);
  const byTrait = ladderType === undefined;
  const [type, setType] = useState("");
  const [value, setValue] = useState("");
  const [level, setLevel] = useState("");
  /*
    Cybereator: "Unopened" beside the rarity levels (owner, 2026-11-10). Any
    piece still sealed at the moment of sale; SealedOnlyZone refuses an opened
    one on chain. Offered only once that zone is deployed.
  */
  const canUnopened = opened && SEALED_ZONE !== undefined;
  const [unopenedPicked, setUnopenedPicked] = useState(false);
  const unopened = canUnopened && unopenedPicked;
  /*
    "Any opened" (owner, 2026-11-13): asked of the opener at the moment of
    sale, so a piece opened after the offer was placed can still accept it.
    It replaces the fixed-list "Rarity: Any", which left those holders out.
  */
  const canAnyOpened = opened && OPENED_ZONE !== undefined;
  const [anyOpenedPicked, setAnyOpenedPicked] = useState(false);
  const anyOpened = canAnyOpened && anyOpenedPicked;
  const guard: false | "sealed" | "opened" = unopened ? "sealed" : anyOpened ? "opened" : false;
  const activeType = type !== "" && types.includes(type) ? type : (types[0] ?? "");
  /** Most common first, which puts a rarity ladder in its own order: Common down to the rarest. */
  const values = sets.filter((s) => s.traitType === activeType).sort((a, b) => b.count - a.count);
  const levels = sets
    .filter((s) => s.traitType === ladderType && !(canAnyOpened && s.value === "Any"))
    .sort((a, b) => ladderOrder(a, b));
  const chosen = byTrait
    ? (values.find((s) => s.value === value) ?? values[0])
    : (levels.find((s) => s.value === level) ?? levels[0]);

  const trait =
    scope === "trait" && chosen !== undefined && guard === false
      ? { root: chosen.root, label: traitLabel(chosen), count: chosen.count, bound }
      : undefined;
  const target = useCollectionOfferTarget(collection, trait, guard);

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
  if (!mounted) return null;

  /* Sentences with a bold trait in the middle, wherever the language puts it. */
  const [exactBefore, exactAfter = ""] = (
    chosen === undefined
      ? ""
      : tr(chosen.count === 1 ? "Covers exactly the {count} piece with {trait}. A holder of any other piece cannot sell into it." : "Covers exactly the {count} pieces with {trait}. A holder of any other piece cannot sell into it.", {
          count: chosen.count.toLocaleString(),
        })
  ).split("{trait}");
  const [growingBefore, growingAfter = ""] = (
    bound === undefined
      ? ""
      : tr("Covers every piece with {trait} minted so far, up to #{bound}. Pieces minted after you place the offer aren’t included, and a holder of any other piece cannot sell into it.", {
          bound: bound.toLocaleString(),
        })
  ).split("{trait}");
  const [openedBefore, openedAfter = ""] = (
    chosen === undefined
      ? ""
      : tr(
          chosen.count === 1
            ? "Covers the {count} opened piece with {trait}. Sealed pieces and pieces opened after you place the offer aren’t included, and a holder of any other piece cannot sell into it."
            : "Covers the {count} opened pieces with {trait}. Sealed pieces and pieces opened after you place the offer aren’t included, and a holder of any other piece cannot sell into it.",
          { count: chosen.count.toLocaleString() },
        )
  ).split("{trait}");

  const countNote = (count: number) =>
    bound === undefined
      ? tr(count === 1 ? "{count} piece" : "{count} pieces", { count: count.toLocaleString() })
      : tr(opened ? "{count} opened" : "{count} minted", { count: count.toLocaleString() });

  return createPortal(
    <>
      <div className="od-scrim" onClick={onClose} aria-hidden="true" />
      <div className="od" role="dialog" aria-modal="true" aria-label={tr("Make a collection offer")}>
        <div className="od-head">
          <div>
            <p className="od-kicker">{tr("Make an offer")}</p>
            <h2>{tr("On the collection")}</h2>
          </div>
          <button type="button" className="od-close" aria-label={tr("Close")} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="od-body">
          {undecided ? (
            <p className="co-scope-note">
              {traitsFailed
                ? tr("Could not read this collection's traits just now. Close this and try again in a moment.")
                : tr("Reading this collection's traits…")}
            </p>
          ) : (
            <p className="co-scope-note">
              {scope === "trait" ? (
                <>
                  <b>{tr("By trait.")}</b> {tr("Only holders of pieces with the trait you pick can accept.")}
                </>
              ) : (
                <>
                  <b>{tr("Any piece.")}</b> {tr("Any holder in the collection can accept.")}
                </>
              )}
            </p>
          )}

          {scope === "trait" && supported && chosen !== undefined ? (
            <div className="co-pick">
              {/*
                The ladder as one dropdown (owner, 2026-11-10): a tile per
                level took two rows of the dialog. Each option still carries
                its count, and the chosen level keeps its colour on the
                trigger.
              */}
              {ladderType !== undefined ? (
                <div className="co-ladder">
                  <Select
                    label={tr(ladderType)}
                    className={`co-ladder-pick co-ladder-${unopened ? "unopened" : anyOpened ? "anyopened" : chosen.value.toLowerCase()}`}
                    value={unopened ? UNOPENED : anyOpened ? ANY_OPENED : chosen.value}
                    onChange={(v) => {
                      setUnopenedPicked(v === UNOPENED);
                      setAnyOpenedPicked(v === ANY_OPENED);
                      if (v !== UNOPENED && v !== ANY_OPENED) setLevel(v);
                    }}
                    options={[
                      ...(canUnopened ? [{ value: UNOPENED, label: tr("Unopened"), note: tr("sealed only") }] : []),
                      ...(canAnyOpened ? [{ value: ANY_OPENED, label: tr("Any opened"), note: tr("any rarity") }] : []),
                      ...levels.map((s) => ({ value: s.value, label: tr(s.value), note: countNote(s.count) })),
                    ]}
                  />
                </div>
              ) : null}
              {byTrait ? (
                <>
                  <Select
                    label={tr("Trait")}
                    value={activeType}
                    onChange={(t) => {
                      setType(t);
                      setValue("");
                    }}
                    options={types.map((t) => ({ value: t, label: t }))}
                  />
                  <Select
                    label={tr("Value")}
                    value={chosen.value}
                    onChange={setValue}
                    options={values.map((s) => ({ value: s.value, label: s.value, note: countNote(s.count) }))}
                  />
                </>
              ) : null}
              {unopened ? (
                <p className="co-pick-note">
                  {tr("Covers any Cybereator still sealed when it is sold to you. If a piece is opened before the sale, the chain refuses it and your offer stays up.")}
                </p>
              ) : anyOpened ? (
                <p className="co-pick-note">
                  {tr("Covers any Cybereator already opened when it is sold to you, any rarity, including pieces opened after you place the offer. A sealed piece is refused on chain.")}
                </p>
              ) : bound !== undefined && opened ? (
                /* Cybereator: every piece opened so far with the trait. A
                   sealed piece is never in the set, and pieces opened later
                   are outside it for good. */
                <p className="co-pick-note">
                  {openedBefore}<b>{traitLabel(chosen)}</b>{openedAfter}
                </p>
              ) : bound === undefined ? (
                <p className="co-pick-note">
                  {exactBefore}<b>{traitLabel(chosen)}</b>{exactAfter}
                </p>
              ) : (
                /* A growing collection: the set is every piece with the trait
                   minted up to now, burned ones included (they can never be
                   sold). Pieces minted later are outside it for good. */
                <p className="co-pick-note">
                  {growingBefore}<b>{traitLabel(chosen)}</b>{growingAfter}
                </p>
              )}
            </div>
          ) : null}

          {/* No list of the offers already standing (owner, 2026-11-10): the
              board behind the dialog shows them, and here they crowded the form. */}
          {undecided ? null : (
            <OfferForm target={target} replacing={false} onDone={() => undefined} onPlaced={onClose} />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * How much a row of offers stands for: offers, and the pieces they still want
 * when that is more — a batch offer for ten is one offer and ten pieces.
 */
function wantedLabel(offers: readonly SeaportOrder[], tr: (text: string, vars?: Record<string, string | number>) => string): string {
  const pieces = offers.reduce((n, o) => n + remainingPieces(o), 0n);
  const head = offers.length === 1 ? tr("1 offer") : tr("{count} offers", { count: offers.length });
  return pieces > BigInt(offers.length) ? tr("{head} · {count} wanted", { head, count: pieces.toString() }) : head;
}
