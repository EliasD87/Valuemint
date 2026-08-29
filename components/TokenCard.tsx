"use client";

import Link from "next/link";
import type { LoadedToken } from "@/hooks/useTokens";
import type { Listing } from "@/hooks/useCollection";
import { formatSoso } from "@/lib/format";
import "./TokenCard.css";

interface Props {
  token: LoadedToken;
  /** Which collection this token belongs to; the card links into it. */
  collection: `0x${string}`;
  listing?: Listing;
  owner?: `0x${string}`;
  viewerAddress?: `0x${string}`;
}

export function TokenCard({ token, collection, listing, owner, viewerAddress }: Props) {
  const isYours =
    owner !== undefined &&
    viewerAddress !== undefined &&
    owner.toLowerCase() === viewerAddress.toLowerCase();
  const tier = token.tier?.toLowerCase() ?? "common";

  return (
    <Link href={`/token/${collection}/${token.id}`} className="tcard">
      <div className="tcard-media">
        {token.image !== undefined ? (
          <img src={token.image} alt={token.design ?? `Token ${token.id}`} loading="lazy" decoding="async" />
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
