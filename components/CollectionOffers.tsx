"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useHoldings } from "@/hooks/useHoldings";
import { useCollectionOffers, useTraitOffers } from "@/hooks/useSeaportOrders";
import { boundsOf, fetchMemberRoots, rootKey, traitLabel, useCriteriaSets, type TraitSetSummary } from "@/hooks/useCriteria";
import { OfferForm, useCollectionOfferTarget } from "@/components/OfferForm";
import { Select } from "@/components/Select";
import { Soso } from "@/components/Soso";
import { AddressLink } from "@/components/AddressLink";
import { whenExpires } from "@/components/Offers";
import { formatSoso } from "@/lib/format";
import { currencyLabel, type SeaportOrder } from "@/lib/seaport";
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
  const { offers: all } = useCollectionOffers(collection);
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
  const { tokens: held } = useHoldings(somethingStanding ? address : undefined);
  const myPieces = useMemo(
    () => held.filter((t) => t.collection.toLowerCase() === collection.toLowerCase()),
    [held, collection],
  );
  const bounds = boundsOf(traitOffers);
  const memberships = useQueries({
    queries: (traits.length > 0 ? myPieces : []).map((t) => ({
      queryKey: ["criteria-member", collection.toLowerCase(), t.id.toString(), bounds.join(",")],
      staleTime: 5 * 60_000,
      queryFn: () => fetchMemberRoots(collection, t.id, bounds),
    })),
  });
  const pieceFor = (o: SeaportOrder): bigint | undefined => {
    if (isMine(o)) return undefined;
    if (o.criteria === undefined || o.criteria === 0n) return myPieces[0]?.id;
    const key = rootKey(o.criteria);
    const i = myPieces.findIndex((_, n) => memberships[n]?.data?.has(key) === true);
    return i < 0 ? undefined : myPieces[i]!.id;
  };
  const accept = (o: SeaportOrder) => {
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

  return (
    <section className="co" aria-label="Collection offers">
      <div className="co-lines">
        <p className="co-line">
          <span className="co-label">Any piece</span>
          {anyPiece[0] === undefined ? (
            <span className="co-none">No offers yet</span>
          ) : (
            <>
              <Soso size={14} unit={currencyLabel(anyPiece[0].currency)}>
                {formatSoso(anyPiece[0].priceWei)}
              </Soso>
              {accept(anyPiece[0])}
            </>
          )}
        </p>
        {traits.slice(0, 3).map(({ offer, set }) => (
          <p key={offer.hash} className="co-line">
            <span className="co-label">{traitLabel(set)}</span>
            <Soso size={14} unit={currencyLabel(offer.currency)}>
              {formatSoso(offer.priceWei)}
            </Soso>
            {accept(offer)}
          </p>
        ))}
        {traits.length > 3 ? <p className="co-more">+{traits.length - 3} more trait offers</p> : null}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Make an offer
      </button>

      {open ? (
        <CollectionOfferDialog
          collection={collection}
          supported={criteria.supported}
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
  loadingTraits,
  sets,
  bound,
  standing,
  onClose,
}: {
  collection: `0x${string}`;
  supported: boolean;
  loadingTraits: boolean;
  sets: TraitSetSummary[];
  /** On a growing collection, the highest token id the sets cover. */
  bound: bigint | undefined;
  standing: Array<{ o: SeaportOrder; label: string }>;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const [scope, setScope] = useState<"any" | "trait">("any");

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
          <div className="co-scope" role="radiogroup" aria-label="What the offer is for">
            <button
              type="button"
              role="radio"
              aria-label="Any piece: any holder in the collection can accept"
              aria-checked={scope === "any"}
              className={`co-scope-btn${scope === "any" ? " is-on" : ""}`}
              onClick={() => setScope("any")}
            >
              <b>Any piece</b>
              <span>Any holder in the collection can accept</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-label="By trait: only holders of pieces with that trait can accept"
              aria-checked={scope === "trait"}
              disabled={!supported}
              className={`co-scope-btn${scope === "trait" ? " is-on" : ""}`}
              onClick={() => setScope("trait")}
            >
              <b>By trait</b>
              <span>
                {supported
                  ? "Only holders of pieces with that trait can accept"
                  : loadingTraits
                    ? "Reading this collection's traits…"
                    : "Not available for this collection"}
              </span>
            </button>
          </div>

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

          <OfferForm target={target} replacing={false} onDone={() => undefined} />
        </div>
      </div>
    </>,
    document.body,
  );
}
