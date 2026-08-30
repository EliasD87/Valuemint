"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useAllOffers, offerKey } from "@/hooks/useAllOffers";
import { OfferDialog } from "@/components/OfferDialog";
import type { LoadedToken } from "@/hooks/useTokens";
import type { Listing } from "@/hooks/useCollection";
import { formatSoso } from "@/lib/format";
import { Art } from "@/components/Art";
import "./TokenCard.css";

interface Props {
  token: LoadedToken;
  /** Which collection this token belongs to; the card links into it. */
  collection: `0x${string}`;
  listing?: Listing;
  owner?: `0x${string}`;
  viewerAddress?: `0x${string}`;
  /**
   * Set on the handful of cards above the fold. Everything else stays lazy —
   * marking a whole grid priority just moves the queue rather than shortening
   * it.
   */
  priority?: boolean;
}

export function TokenCard({ token, collection, listing, owner, viewerAddress, priority = false }: Props) {
  const { isConnected } = useAccount();
  const isYours =
    owner !== undefined &&
    viewerAddress !== undefined &&
    owner.toLowerCase() === viewerAddress.toLowerCase();
  const tier = token.tier?.toLowerCase() ?? "common";

  /**
   * One query for the whole marketplace, shared by every card. React Query
   * collapses the identical key, so a grid of twenty cards costs one log scan
   * rather than twenty.
   */
  const allOffers = useAllOffers();
  const offer = allOffers.get(offerKey(collection, token.id));
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
            <dt>{listing !== undefined ? "Price" : "Status"}</dt>
            <dd className={listing !== undefined ? "tcard-price" : "tcard-none"}>
              {listing !== undefined ? `${formatSoso(listing.price)} SOSO` : "Not listed"}
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
