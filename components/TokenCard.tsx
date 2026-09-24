"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useOffersForToken } from "@/hooks/useSeaportOrders";
import { OfferDialog } from "@/components/OfferDialog";
import type { LoadedToken } from "@/hooks/useTokens";
import type { Listing } from "@/lib/seaport";
import { formatSoso } from "@/lib/format";
import { tierClass } from "@/lib/tokenMetadata";
import { heldBackFor } from "@/config/reveal";
import { revealShort } from "@/lib/unrevealed";
import { Art } from "@/components/Art";
import { Wordmark } from "@/components/Wordmark";
import { wordmarkSaying } from "@/config/wordmarks";
import { soleArtworkFor } from "@/config/covers";
import "./TokenCard.css";
import { Soso } from "@/components/Soso";

interface Props {
  token: LoadedToken;
  /** Which collection this token belongs to; the card links into it. */
  collection: `0x${string}`;
  /**
   * The collection's on-chain `name()`, used as the token's identity when the
   * token has none of its own.
   *
   * `name()` is mandatory ERC-721 Metadata and answers even for a collection
   * that publishes nothing per token, so a piece is never really nameless -
   * "Unnamed" was us discarding the one name that exists. Optional because not
   * every caller has it to hand; the card falls back further when it is absent.
   */
  collectionName?: string;
  listing?: Listing;
  owner?: `0x${string}`;
  viewerAddress?: `0x${string}`;
  /**
   * Does anything vouch for this collection — the factory, or `known.ts`?
   *
   * `undefined` means the caller does not know and the card says nothing. The
   * distinction matters: the marketplace lists any ERC-721 the explorer has
   * indexed, so "we have heard of this contract" was being shown in a way that
   * reads as "we vouch for this contract". Anyone can deploy a contract named
   * after a real collection, point its tokenURI at copies of the artwork, list
   * it, and appear in the same grid under the same name.
   *
   * Deliberately NOT `fromFactory` alone: The Trenches is a first-party
   * collection deployed by script rather than through the factory, and flagging
   * it identically to a stranger's impersonation would teach people to ignore
   * the badge.
   */
  vouched?: boolean;
  /**
   * Whether to badge this as yours.
   *
   * On in a mixed grid, where "Yours" is the whole point — /market and a
   * collection page put your pieces among everyone else's. Off on /portfolio,
   * which is nothing BUT your pieces, so the badge is on every card and
   * therefore tells you nothing about any of them.
   *
   * Only the badge. `isYours` also decides whether this card offers to bid,
   * and that must keep working from the addresses wherever the card appears —
   * a page that turned the badge off should not start offering you your own
   * token.
   */
  markOwned?: boolean;
  /**
   * Set on the handful of cards above the fold. Everything else stays lazy —
   * marking a whole grid priority just moves the queue rather than shortening
   * it.
   */
  priority?: boolean;
  /**
   * What the cheapest comparable piece is listed at.
   *
   * Only shown when this piece is NOT listed, because that is the one case
   * where the card otherwise answers "what is this worth" with "Not listed".
   * When it IS listed, the seller's own price is the more useful number and a
   * floor beside it would invite reading one as the other.
   *
   * The caller decides what "comparable" means — a collection floor, or that
   * piece's own tier where the collection has several. It is not derived here,
   * because a card has no business running a scan.
   */
  floor?: bigint;
}

export function TokenCard({
  token,
  collection,
  collectionName,
  listing,
  owner,
  viewerAddress,
  vouched,
  priority = false,
  floor,
  /* On by default: a mixed grid is the common case, and that is where the
     badge earns its place. */
  markOwned = true,
}: Props) {
  const { isConnected } = useAccount();
  const isYours =
    owner !== undefined &&
    viewerAddress !== undefined &&
    owner.toLowerCase() === viewerAddress.toLowerCase();
  const tier = tierClass(token.tier) ?? "common";

  /**
   * The held-back tail this piece belongs to, or nothing.
   *
   * Read from `tier` and `edition`, NOT from `design`, and that is not a
   * preference — `design` cannot answer this question. `useGenericTokens`,
   * which is what feeds the collection page, derives it as
   * `traitOf("Design") ?? metadata.name ?? "#id"`, so a held-back piece comes
   * back with the design "ValueChain Genesis #78": never undefined, and the
   * first version of this gate silently never fired. `tier` and `edition` are
   * read from traits alone and are absent exactly when the design is withheld.
   *
   * `heldBackFor` is the other half. Absent traits alone describe half the
   * contracts on the chain, and telling a stranger's holder that their piece
   * is awaiting a reveal would be a claim about somebody else's collection.
   */
  const heldBack = heldBackFor(collection);
  const awaitingReveal =
    heldBack !== undefined && token.tier === undefined && token.edition === undefined
      ? heldBack
      : undefined;

  /**
   * The contract answered, and its answer was nothing.
   *
   * `tokenURI` returning an empty string is not a failure and not a slow
   * gateway — it is a collection that publishes no metadata at all, so there is
   * no name, no image and no traits to find anywhere. TestSoDEXTreasureBox is
   * one: it reports `supportsInterface(ERC721Metadata) = true` and then returns
   * `""` for every token, and its `baseURI()` is empty too.
   *
   * Showing the loading shimmer for that is a lie that never resolves, and the
   * reasonable reading of it is that ValueMint is broken. It is not: only the
   * collection's owner can publish artwork, and this one never did.
   *
   * `undefined` still means the read has not landed — that one keeps shimmering.
   */
  const noMetadata = token.uri !== undefined && token.uri.trim() === "";

  /**
   * Our own copy of the artwork, where this collection has one.
   *
   * Preferred over the token's metadata image rather than used as a fallback:
   * for these collections the two are the same picture, and the local file is
   * the smaller, lighter, faster-serving one. See `soleArtworkFor`.
   */
  const image = soleArtworkFor(collection) ?? token.image;

  /** The collection's drawn name, if this piece's name is the word it draws. */
  const titleMark = wordmarkSaying(collection, token.design);

  /**
   * One scan for the whole marketplace, shared by every card. React Query
   * collapses the identical key, so a grid of twenty cards costs one log scan
   * rather than twenty.
   *
   * This now includes collection-wide bids, so a card shows a price somebody
   * will actually pay for it even when nobody has named this exact piece -
   * which, for a collection of one design in five editions, is most of them.
   */
  const { offers } = useOffersForToken(collection, token.id);
  const offer =
    offers.length === 0 ? undefined : { count: offers.length, best: offers[0]!.priceWei };
  const [offering, setOffering] = useState(false);

  /**
   * The card used to be a single `<Link>` wrapping everything, which left
   * nowhere valid to put a button: a button inside an anchor is invalid HTML
   * and the click handling is ambiguous even where browsers tolerate it.
   *
   * So the card is a container now, with the link stretched invisibly across it
   * and the offer button sitting above that overlay. The whole card is still
   * one target; the button is a smaller one on top of it.
   */
  return (
    <article className="tcard">
      <Link
        href={`/token/${collection}/${token.id}`}
        className="tcard-hit"
        aria-label={`${token.design ?? collectionName ?? "Token"} #${token.id.toString()}`}
      />
      <div className="tcard-media">
        {image !== undefined ? (
          /**
           * Through `Art`, not a bare <img>.
           *
           * IPFS serves exactly what was pinned and nothing smaller, so a raw
           * tag put the full original into a ~240px slot: measured at ~270KB
           * and 2.5-3.3s per image from the gateway, times a dozen cards. The
           * optimiser fetches once, resizes to the slot and caches, which is
           * the whole reason `Art` exists — this card simply never used it.
           */
          <Art
            src={image}
            alt={token.design ?? `${collectionName ?? "Token"} ${token.id}`}
            sizes="(max-width: 560px) 50vw, (max-width: 1100px) 33vw, 260px"
            priority={priority}
            /*
              Cards move. This is the grid the owner was looking at when they
              said, twice, that the GIF was not playing — the token page had
              been fixed and this had not, because a 2.3 MB animation times
              sixty cards was the wrong sum. It is the wrong sum: `useMoving`
              fetches one file per distinct artwork URL, and these collections
              point every token at the same one, so a full grid of Cybereators
              costs a single 598 KB download.
            */
            motion
          />
        ) : noMetadata ? (
          <div className="tcard-placeholder tcard-bare">
            <span>No artwork published</span>
          </div>
        ) : (
          <div className="tcard-placeholder tcard-loading" aria-hidden="true" />
        )}
        {/*
          The tier, as a band across the top of the art rather than a chip in
          the corner.

          It reuses `chip-<tier>` for the tier's identity and overrides the two
          colour properties, so a tier added to the palette needs nothing here.
          The ink is `--paper` and that is not a guess: measured across all six
          tiers, every colour is DARK in the light theme (luminance .077-.149)
          and LIGHT in the dark one (.336-.456), so the readable ink is always
          the inverse of the page's — which is what `--paper` is. Worst pair is
          5.27:1, best 9.29:1.
        */}
        {token.tier !== undefined ? (
          <span className={`tcard-ribbon chip-${tier}`}>{token.tier}</span>
        ) : null}

        <div className="tcard-badges">
          {isYours && markOwned ? <span className="chip chip-up">Yours</span> : null}
        </div>
      </div>

      <div className="tcard-body">
        <div className="tcard-head">
          {/*
            The collection's own drawing of its name, where there is one.

            Same substitution the featured grid and the collection heading
            already make, and it lands on the same `.tcard-title` slot the
            grid uses — which is why `Wordmark.css` beats that class's
            `flex: 1` with a doubled selector rather than a width here.

            `wordmarkSaying` rather than `wordmarkFor`: this text is the
            PIECE's name, and the mark may only stand in for it when it spells
            the same word. See the note on it in `config/wordmarks.ts`.
          */}
          {titleMark !== undefined && token.design !== undefined ? (
            <Wordmark mark={titleMark} name={token.design} className="tcard-title" />
          ) : (
            <span className="tcard-title">
              {token.design ??
                (noMetadata ? (
                  <span className="tcard-fallback-name">{collectionName ?? "Unnamed"}</span>
                ) : (
                  "—"
                ))}
            </span>
          )}
          <span className="tcard-num">#{token.id.toString()}</span>
        </div>

        {/*
          The price, under the art and in the largest type on the card.

          It used to be plated over the foot of the artwork in small capitals,
          and people reported it hard to find: a figure on a picture reads as
          part of the picture. Marketplaces people already know put it here,
          under the image, as the one number on the card, and the eye goes
          looking for it here first.

          Everything else that is true goes on the bottom line with the offers
          and the Offer button, rather than a line of its own that stood empty
          on every card of a collection with no editions.
        */}
        <div className="tcard-money">
          {listing !== undefined ? (
            <span className="tcard-amount">
              <Soso size={15} markAt="unit">
                {formatSoso(listing.price)}
              </Soso>
            </span>
          ) : (
            <span className="tcard-amount is-none">Not listed</span>
          )}
        </div>

        {/*
          Offers matter most on tokens that are *not* listed, where buying is
          not an option - and until now the only route to one was navigating
          into the token page, which nobody discovers. Owners see the standing
          bid rather than a button: they accept on the token page, where the
          slippage guard and the full list of bidders live.

          Beside them, whatever else applies, and only that: a warning, a
          floor for an unlisted piece, the edition or a reveal date. A floor
          is always labelled — it is somebody ELSE'S price, and a bare figure
          would read as this piece's own. "No offers" only when nothing else
          is there to say.
        */}
        <div className="tcard-offer-row">
          <span className="tcard-meta">
            {vouched === false ? (
              <span
                className="tcard-unverified"
                title="Not created through ValueMint. Check the contract address before buying — anyone can deploy a collection using someone else's name and artwork."
              >
                Unverified
              </span>
            ) : null}
            {listing === undefined && floor !== undefined ? (
              <span className="tcard-floor">
                Floor{" "}
                <Soso size={12} markAt="unit">
                  {formatSoso(floor)}
                </Soso>
              </span>
            ) : null}
            {/*
              A held-back piece has no edition, and the date it becomes public
              is the one fact about it that exists. Both conditions, as ever: a
              document naming no design is not enough, or a third-party
              contract that publishes none would advertise a reveal it never
              promised.
            */}
            {awaitingReveal !== undefined ? (
              <span className="tcard-reveal">Reveals {revealShort(awaitingReveal)}</span>
            ) : token.edition !== undefined ? (
              <span>Ed. {token.edition}</span>
            ) : null}
            {offer !== undefined ? (
              <span className="tcard-offer-best">
                {offer.count > 1 ? `${offer.count} offers · ` : ""}
                best <b>{formatSoso(offer.best)}</b>
              </span>
            ) : (listing === undefined && floor !== undefined) ||
              awaitingReveal !== undefined ||
              token.edition !== undefined ? null : (
              <span className="tcard-offer-none">No offers</span>
            )}
          </span>

          {isConnected && !isYours ? (
            <button type="button" className="tcard-offer-btn" onClick={() => setOffering(true)}>
              Offer
            </button>
          ) : null}
        </div>
      </div>

      {offering ? (
        <OfferDialog
          collection={collection}
          tokenId={token.id}
          name={token.design ?? `#${token.id.toString()}`}
          onClose={() => setOffering(false)}
        />
      ) : null}
    </article>
  );
}

export function TokenCardSkeleton() {
  return (
    <div className="tcard" aria-hidden="true" style={{ pointerEvents: "none" }}>
      <div className="tcard-media">
        <div className="tcard-placeholder tcard-loading" />
      </div>
      <div className="tcard-body">
        <div className="skeleton" style={{ height: "1rem", width: "58%" }} />
        <div className="skeleton" style={{ height: "1.3rem", width: "46%" }} />
        <div className="skeleton" style={{ height: "0.8rem", width: "70%" }} />
      </div>
    </div>
  );
}
