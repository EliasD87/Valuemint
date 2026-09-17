"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useOffersForToken } from "@/hooks/useSeaportOrders";
import { OfferDialog } from "@/components/OfferDialog";
import type { LoadedToken } from "@/hooks/useTokens";
import type { Listing } from "@/lib/seaport";
import { formatSoso } from "@/lib/format";
import { Art } from "@/components/Art";
import "./TokenCard.css";
import { Soso } from "@/components/Soso";

interface Props {
  token: LoadedToken;
  /** Which collection this token belongs to; the card links into it. */
  collection: `0x${string}`;
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
}

export function TokenCard({
  token,
  collection,
  listing,
  owner,
  viewerAddress,
  vouched,
  priority = false,
}: Props) {
  const { isConnected } = useAccount();
  const isYours =
    owner !== undefined &&
    viewerAddress !== undefined &&
    owner.toLowerCase() === viewerAddress.toLowerCase();
  const tier = token.tier?.toLowerCase() ?? "common";

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
        aria-label={`${token.design ?? "Token"} #${token.id.toString()}`}
      />
      <div className="tcard-media">
        {token.image !== undefined ? (
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
            src={token.image}
            alt={token.design ?? `Token ${token.id}`}
            sizes="(max-width: 560px) 50vw, (max-width: 1100px) 33vw, 260px"
            priority={priority}
          />
        ) : (
          <div className="tcard-placeholder skeleton" aria-hidden="true" />
        )}
        <div className="tcard-badges">
          {token.tier !== undefined ? <span className={`chip chip-${tier}`}>{token.tier}</span> : <span />}
          {isYours ? <span className="chip chip-up">Yours</span> : null}
        </div>
      </div>

      <div className="tcard-body">
        <div className="tcard-head">
          <span className="tcard-title">{token.design ?? "—"}</span>
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
              {listing !== undefined ? "Price" : "Status"}
            </dt>
            <dd className={listing !== undefined ? "tcard-price" : "tcard-none"}>
              {listing !== undefined ? (
                <Soso>{formatSoso(listing.price)}</Soso>
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
        <div className="tcard-placeholder skeleton" />
      </div>
      <div className="tcard-body">
        <div className="skeleton" style={{ height: "1rem", width: "58%" }} />
        <div className="skeleton" style={{ height: "1.4rem", width: "100%" }} />
      </div>
    </div>
  );
}
