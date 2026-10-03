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
import { AddressLink } from "@/components/AddressLink";
import { whenExpires } from "@/components/Offers";
import { formatSoso } from "@/lib/format";
import { currencyLabel, remainingPieces, type SeaportOrder } from "@/lib/seaport";
import { SellIntoOffer } from "@/components/SellIntoOffer";
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
export function CollectionOffers({ collection }: { collection: `0x${string}` }) {
  const { offers: all, isLoading: loadingOffers } = useCollectionOffers(collection);
  const { offers: traitOffers } = useTraitOffers(collection);
  /* Asked for the snapshots standing offers were made at too, or an offer made
     before the latest mint on a growing collection would not be recognised. */
  const criteria = useCriteriaSets(collection, boundsOf(traitOffers));
  const [open, setOpen] = useState(false);

  /** Only bids on the collection as a whole: the list above also holds bids on single pieces. */
  const anyPiece = all.filter((o) => o.tokenId === undefined);

  /** Only trait offers whose root is a set we recognise; anything else is not shown. */
  const traits = traitOffers.flatMap((o) => {
    const set = o.criteria === undefined ? undefined : criteria.byRoot.get(rootKey(o.criteria));
    return set === undefined ? [] : [{ offer: o, set }];
  });

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
  const pieceFor = (o: SeaportOrder): bigint | undefined => piecesFor(o)[0];
  /** Every piece the viewer holds that this offer can take. */
  const piecesFor = (o: SeaportOrder): bigint[] => {
    if (isMine(o)) return [];
    if (o.criteria === undefined || o.criteria === 0n) return myIds;
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
        <Link className="btn btn-sm co-accept" href="/portfolio" title="Accept from your portfolio">
          Accept
        </Link>
      );
    }
    if (checkingPieces || (trait && checkingTraits)) {
      return <span className="co-accept-wait" role="status" aria-label="Checking your pieces" />;
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
          Sell up to {most}
        </button>
      );
    }
    const id = pieceFor(o);
    return id === undefined ? null : (
      <Link
        className="btn btn-sm co-accept"
        href={`/token/${collection}/${id.toString()}`}
        title={`Accept on your #${id.toString()}`}
      >
        Accept
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
    if (anyPiece.length > 0) byKey.set("any", { key: "any", value: "Any piece", offers: [...anyPiece] });
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

  const [expanded, setExpanded] = useState(false);
  const ROWS = 4;
  const visible = expanded ? groups : groups.slice(0, ROWS);
  const count = groups.reduce((n, g) => n + g.offers.length, 0);
  const best = groups[0]?.offers[0];

  /** The best offer in a group this viewer could take, else the best one there. */
  const takeable = (offers: SeaportOrder[]) =>
    offers.find((o) => !isMine(o) && pieceFor(o) !== undefined) ?? offers.find((o) => !isMine(o));

  return (
    <section className="co" aria-label="Collection offers">
      <div className="co-head">
        <div className="co-title">
          <span className="co-eyebrow">Collection offers</span>
          <span className="co-sub">
            {count > 0 && best !== undefined ? (
              <>
                {count === 1 ? "1 offer" : `${count} offers`} · best{" "}
                <Soso size={12} unit={currencyLabel(best.currency)}>
                  {formatSoso(best.priceWei)}
                </Soso>
              </>
            ) : loadingOffers ? (
              <span className="co-checking" role="status">
                <span className="co-accept-wait" aria-hidden="true" />
                Checking offers…
              </span>
            ) : hasTraits ? (
              "None yet. Offer on a trait and every holder of it can accept."
            ) : (
              "None yet. Offer on the collection and any holder can accept."
            )}
          </span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Make an offer
        </button>
      </div>

      {visible.length === 0 ? null : (
        <ul className="co-board">
          {visible.map((g) => {
            const top = g.offers[0]!;
            const target = takeable(g.offers);
            return (
              <li key={g.key} className="co-row">
                <span className="co-what">
                  {g.type === undefined ? null : <span className="co-type">{g.type}</span>}
                  <b>{g.value}</b>
                </span>
                <span className="co-count">{wantedLabel(g.offers)}</span>
                <span className="co-best">
                  <Soso size={14} unit={currencyLabel(top.currency)}>
                    {formatSoso(top.priceWei)}
                  </Soso>
                </span>
                <span className="co-act">{target === undefined ? null : accept(target, g.type === undefined ? g.value : `${g.type}: ${g.value}`)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {groups.length > ROWS ? (
        <button type="button" className="co-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show fewer" : `+${groups.length - ROWS} more`}
        </button>
      ) : null}

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

      {open ? (
        <CollectionOfferDialog
          collection={collection}
          supported={criteria.supported}
          hasTraits={hasTraits}
          traitsFailed={criteria.isError}
          loadingTraits={criteria.isLoading}
          sets={criteria.sets}
          bound={criteria.bound}
          standing={[...anyPiece.map((o) => ({ o, label: "Any piece" })), ...traits.map((t) => ({ o: t.offer, label: traitLabel(t.set) }))]}
          onClose={() => setOpen(false)}
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
const traitRank = (t: string) => {
  const i = RARITY_FIRST.indexOf(t.toLowerCase());
  return i === -1 ? RARITY_FIRST.length : i;
};

function CollectionOfferDialog({
  collection,
  supported,
  hasTraits,
  traitsFailed,
  loadingTraits,
  sets,
  bound,
  standing,
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
  standing: Array<{ o: SeaportOrder; label: string }>;
  onClose: () => void;
}) {
  const { address } = useAccount();
  /* Never "any" on a collection with traits, and nothing at all until that is known. */
  const scope: "any" | "trait" = hasTraits ? "trait" : "any";
  const undecided = loadingTraits || traitsFailed;

  const types = useMemo(
    () => [...new Set(sets.map((s) => s.traitType))].sort((a, b) => traitRank(a) - traitRank(b)),
    [sets],
  );
  const [type, setType] = useState("");
  const [value, setValue] = useState("");
  const activeType = type !== "" && types.includes(type) ? type : (types[0] ?? "");
  /** Most common first, which puts a rarity ladder in its own order: Common down to the rarest. */
  const values = sets.filter((s) => s.traitType === activeType).sort((a, b) => b.count - a.count);
  const chosen = values.find((s) => s.value === value) ?? values[0];

  const trait =
    scope === "trait" && chosen !== undefined
      ? { root: chosen.root, label: traitLabel(chosen), count: chosen.count, bound }
      : undefined;
  const target = useCollectionOfferTarget(collection, trait);

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

  const isMine = (maker: string) => address !== undefined && maker.toLowerCase() === address.toLowerCase();

  return createPortal(
    <>
      <div className="od-scrim" onClick={onClose} aria-hidden="true" />
      <div className="od" role="dialog" aria-modal="true" aria-label="Make a collection offer">
        <div className="od-head">
          <div>
            <p className="od-kicker">Make an offer</p>
            <h2>On the collection</h2>
          </div>
          <button type="button" className="od-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="od-body">
          {undecided ? (
            <p className="co-scope-note">
              {traitsFailed
                ? "Could not read this collection's traits just now. Close this and try again in a moment."
                : "Reading this collection's traits…"}
            </p>
          ) : (
            <p className="co-scope-note">
              {scope === "trait" ? (
                <>
                  <b>By trait.</b> Only holders of pieces with the trait you pick can accept.
                </>
              ) : (
                <>
                  <b>Any piece.</b> Any holder in the collection can accept.
                </>
              )}
            </p>
          )}

          {scope === "trait" && supported && chosen !== undefined ? (
            <div className="co-pick">
              <Select
                label="Trait"
                value={activeType}
                onChange={(t) => {
                  setType(t);
                  setValue("");
                }}
                options={types.map((t) => ({ value: t, label: t }))}
              />
              <Select
                label="Value"
                value={chosen.value}
                onChange={setValue}
                options={values.map((s) => ({
                  value: s.value,
                  label: s.value,
                  note:
                    bound === undefined
                      ? `${s.count.toLocaleString()} ${s.count === 1 ? "piece" : "pieces"}`
                      : `${s.count.toLocaleString()} minted`,
                }))}
              />
              {bound === undefined ? (
                <p className="co-pick-note">
                  Covers exactly the {chosen.count.toLocaleString()} {chosen.count === 1 ? "piece" : "pieces"} with{" "}
                  <b>{traitLabel(chosen)}</b>. A holder of any other piece cannot sell into it.
                </p>
              ) : (
                /* A growing collection: the set is every piece with the trait
                   minted up to now, burned ones included (they can never be
                   sold). Pieces minted later are outside it for good. */
                <p className="co-pick-note">
                  Covers every piece with <b>{traitLabel(chosen)}</b> minted so far, up to #
                  {bound.toLocaleString()}. Pieces minted after you place the offer aren&rsquo;t
                  included, and a holder of any other piece cannot sell into it.
                </p>
              )}
            </div>
          ) : null}

          {standing.length > 0 ? (
            <ul className="od-standing">
              {standing.slice(0, 4).map(({ o, label }) => (
                <li key={o.hash}>
                  <span className="mono">
                    <Soso size={16} unit={currencyLabel(o.currency)}>
                      {formatSoso(o.priceWei)}
                    </Soso>
                  </span>
                  <span>
                    {isMine(o.maker) ? "You" : <AddressLink address={o.maker} chars={4} />} &middot; {label} &middot;{" "}
                    {whenExpires(o.endTime)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {undecided ? null : <OfferForm target={target} replacing={false} onDone={() => undefined} />}
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
function wantedLabel(offers: readonly SeaportOrder[]): string {
  const pieces = offers.reduce((n, o) => n + remainingPieces(o), 0n);
  const head = offers.length === 1 ? "1 offer" : `${offers.length} offers`;
  return pieces > BigInt(offers.length) ? `${head} · ${pieces.toString()} wanted` : head;
}
