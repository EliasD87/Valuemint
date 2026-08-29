"use client";

import Link from "next/link";
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
  const isYours =
    owner !== undefined &&
    viewerAddress !== undefined &&
    owner.toLowerCase() === viewerAddress.toLowerCase();
  const tier = token.tier?.toLowerCase() ?? "common";

  return (
    <Link href={`/token/${collection}/${token.id}`} className="tcard">
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
      </div>
    </Link>
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
