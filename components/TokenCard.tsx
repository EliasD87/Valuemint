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
import { Art } from "@/components/Art";
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
}: Props) {
  const { isConnected } = useAccount();
  const isYours =
    owner !== undefined &&
    viewerAddress !== undefined &&
    owner.toLowerCase() === viewerAddress.toLowerCase();
  const tier = tierClass(token.tier) ?? "common";

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
        <div className="tcard-badges">
          {token.tier !== undefined ? <span className={`chip chip-${tier}`}>{token.tier}</span> : <span />}
          {isYours ? <span className="chip chip-up">Yours</span> : null}
        </div>
      </div>

      <div className="tcard-body">
        <div className="tcard-head">
          <span className="tcard-title">
            {token.design ??
              (noMetadata ? (
                <span className="tcard-fallback-name">{collectionName ?? "Unnamed"}</span>
              ) : (
                "—"
              ))}
          </span>
          <span className="tcard-num">#{token.id.toString()}</span>
        </div>

        <dl className="tcard-foot">
          <div className="tcard-cell">
            <dt>Edition</dt>
            <dd>{token.edition ?? "—"}</dd>
          </div>
          <div className="tcard-cell tcard-cell-end">
            <dt>
              {vouched === false ? (
                <span
                  className="tcard-unverified"
                  title="Not created through ValueMint. Check the contract address before buying — anyone can deploy a collection using someone else's name and artwork."
                >
                  Unverified
                </span>
              ) : null}
              {listing !== undefined ? "Price" : floor !== undefined ? "Floor" : "Status"}
            </dt>
            {/*
              Three states, and the middle one is the new one.

              Listed: the seller's own asking price. Unlisted with a floor: what
              the cheapest comparable piece is going for, which is the honest
              answer to "what is this worth" that "Not listed" never gave.
              Unlisted with nothing to compare against: still "Not listed",
              because inventing a number would be worse than admitting there
              isn't one.

              Styled `tcard-floor` rather than `tcard-price` deliberately. A
              floor is somebody else's price, and making it look like this
              piece's own would be a quiet lie on a page about what you own.
            */}
            <dd
              className={
                listing !== undefined
                  ? "tcard-price"
                  : floor !== undefined
                    ? "tcard-floor"
                    : "tcard-none"
              }
            >
              {listing !== undefined ? (
                <Soso>{formatSoso(listing.price)}</Soso>
              ) : floor !== undefined ? (
                <Soso>{formatSoso(floor)}</Soso>
              ) : (
                "Not listed"
              )}
            </dd>
          </div>
        </dl>

        {/*
          Offers matter most on tokens that are *not* listed, where buying is
          not an option - and until now the only route to one was navigating
          into the token page, which nobody discovers. Owners see the standing
          bid rather than a button: they accept on the token page, where the
          slippage guard and the full list of bidders live.
        */}
        <div className="tcard-offer-row">
          {offer !== undefined ? (
            <span className="tcard-offer-best">
              {offer.count > 1 ? `${offer.count} offers · ` : ""}
              best <b className="mono">{formatSoso(offer.best)}</b>
            </span>
          ) : (
            <span className="tcard-offer-none">No offers</span>
          )}

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
        <div className="skeleton" style={{ height: "1.4rem", width: "100%" }} />
      </div>
    </div>
  );
}
