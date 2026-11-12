"use client";

import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { WarmLink } from "@/components/WarmLink";
import { Art } from "@/components/Art";
import { Soso } from "@/components/Soso";
import { OfferDialog } from "@/components/OfferDialog";
import { useTokenOffers } from "@/hooks/useTokenOffers";
import type { LoadedToken } from "@/hooks/useTokens";
import type { Listing } from "@/lib/seaport";
import { formatSoso } from "@/lib/format";
import { tierClass } from "@/lib/tokenMetadata";
import { cybereatorStatus } from "@/lib/cybereator";
import { bundledArtworkFor, cachedArtwork, soleArtworkFor, thumbnailFor } from "@/config/covers";
import { offersAllowed } from "@/config/kols";
import { useT } from "@/lib/i18n";
import "./TokenCard.css";
import "./CybereatorCard.css";

/** Foil on these levels only: Common and Uncommon are plain card stock. */
const FOIL = new Set(["rare", "epic", "legendary"]);

/**
 * Cybereator's own card (owner, 2026-11-12, after a trading-card reference):
 * printed card stock with a dot grid, the art inset, and the piece's number
 * and race · rarity underneath. Rare and Epic carry a rainbow foil and
 * Legendary a gold one; under a mouse the card tilts and the foil and a
 * glare follow the pointer.
 *
 * Everywhere a Cybereator is drawn as a card (the collection page, the
 * market, a portfolio), so `TokenCard` hands over to this and keeps its own
 * props: what a card has to do — link to the piece, show its price, Buy and
 * Offer, the "Yours" badge, bulk picking — is unchanged, only the look is
 * Cybereator's.
 *
 * Cheap on a grid of sixty: the pointer writes custom properties on the card
 * itself, once per frame, and nothing re-renders; the foil moves by transform
 * alone. At rest the foil is faint and drifts a little; under the mouse it
 * shines, follows, and stays where the mouse left it. Touch gets no tilt;
 * reduced motion gets nothing moving.
 */
export function CybereatorCard({
  token,
  collection,
  collectionName,
  listing,
  owner,
  viewerAddress,
  priority = false,
  floor,
  markOwned = true,
  pick,
}: {
  token: LoadedToken;
  collection: `0x${string}`;
  collectionName?: string;
  listing?: Listing;
  owner?: `0x${string}`;
  viewerAddress?: `0x${string}`;
  priority?: boolean;
  floor?: bigint;
  markOwned?: boolean;
  pick?: { on: boolean; toggle: () => void };
}) {
  const t = useT();
  const { isConnected } = useAccount();
  const isYours =
    owner !== undefined && viewerAddress !== undefined && owner.toLowerCase() === viewerAddress.toLowerCase();

  /* Unopened, Opening or Rendering while a piece is sealed or mid-reveal; nothing once final. */
  const status = cybereatorStatus(token.metadata);
  const race = token.metadata?.attributes.find((a) => a.trait_type === "Race")?.value;
  const level = status === undefined ? tierClass(token.tier) : undefined;
  const foil = level !== undefined && FOIL.has(level);

  const image =
    soleArtworkFor(collection) ??
    bundledArtworkFor(token.image, token.uri) ??
    cachedArtwork(thumbnailFor(token.image) ?? token.image);

  const { offers } = useTokenOffers(collection, token.id);
  const best = offers[0]?.priceWei;
  const [offering, setOffering] = useState(false);
  const name = `${collectionName ?? "Cybereator"} #${token.id.toString()}`;
  const showFloor = listing === undefined && floor !== undefined;

  /* ---------------------------------------------------------- the pointer */
  const card = useRef<HTMLElement>(null);
  const frame = useRef(0);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = card.current;
    if (el === null) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      el.style.setProperty("--px", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--py", `${(y * 100).toFixed(1)}%`);
      /* The foil band crosses the card against the pointer, never parking off it. */
      el.style.setProperty("--tx", `${((0.5 - x) * 32).toFixed(1)}%`);
      el.style.setProperty("--ty", `${((0.5 - y) * 32).toFixed(1)}%`);
      el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
      el.classList.add("is-live");
    });
  };
  const leave = () => {
    cancelAnimationFrame(frame.current);
    const el = card.current;
    if (el === null) return;
    /* The tilt and the light go; the foil stays where the pointer left it. */
    for (const p of ["--px", "--py", "--rx", "--ry"]) el.style.removeProperty(p);
    el.classList.remove("is-live");
  };

  const kind =
    token.metadata === undefined ? (
      <span className="cyc-kind-wait skeleton" aria-hidden="true" />
    ) : status !== undefined ? (
      <span className="cyc-kind">
        <b className="cyc-level is-sealed">{status.toLowerCase() === "unopened" ? t("Sealed") : t("Opening")}</b>
      </span>
    ) : (
      <span className="cyc-kind">
        {race === undefined ? null : (
          <>
            {t(String(race))}
            <i aria-hidden="true">·</i>
          </>
        )}
        {token.tier === undefined ? null : <b className={`cyc-level cyc-level-${level ?? "none"}`}>{t(token.tier)}</b>}
      </span>
    );

  return (
    <article
      ref={card}
      className={`tcard cyc${level === undefined ? "" : ` cyc-${level}`}${foil ? " has-foil" : ""}${pick?.on === true ? " is-picked" : ""}`}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <WarmLink href={`/token/${collection}/${token.id}`} className="tcard-hit" aria-label={name} />

      <div className="cyc-art">
        {image !== undefined ? (
          <Art
            src={image}
            alt={name}
            sizes="(max-width: 560px) 50vw, (max-width: 1100px) 33vw, 260px"
            priority={priority}
            motion
          />
        ) : (
          <div className="tcard-placeholder tcard-loading" aria-hidden="true" />
        )}
        <div className="tcard-badges">
          {isYours && markOwned ? <span className="chip chip-up">{t("Yours")}</span> : null}
        </div>
      </div>

      <div className="cyc-plate">
        <div className="cyc-line">
          {/* Four digits, as the collection numbers itself: 3,918 pieces. */}
          <span className="cyc-no">{t("No. {id}", { id: token.id.toString().padStart(4, "0") })}</span>
          {listing !== undefined ? (
            <span className="cyc-price">
              <Soso size={14} unit="">
                {formatSoso(listing.price)}
              </Soso>
            </span>
          ) : (
            <span className="cyc-price is-none">{t("Not listed")}</span>
          )}
        </div>
        <div className="cyc-line">{kind}</div>

        <div className="cyc-foot">
          <span className="cyc-offers">
            {!offersAllowed(collection) ? null : best !== undefined ? (
              <span>
                {/* The count gives way to the floor: both do not fit a narrow card. */}
                {offers.length > 1 && !showFloor ? t("{count} offers · ", { count: offers.length }) : ""}
                {t("best")} <b>{formatSoso(best)}</b>
              </span>
            ) : showFloor ? null : (
              <span className="cyc-offers-none">{t("No offers")}</span>
            )}
            {/* Somebody else's price, so always labelled; only for an unlisted piece. */}
            {showFloor && floor !== undefined ? (
              <span className="cyc-floor">
                {t("Floor")} <b>{formatSoso(floor)}</b>
              </span>
            ) : null}
          </span>
          <span className="tcard-acts">
            {listing !== undefined && !isYours ? (
              <WarmLink className="tcard-buy-btn" href={`/token/${collection}/${token.id}`}>
                {t("Buy")}
              </WarmLink>
            ) : null}
            {isConnected && !isYours && offersAllowed(collection) ? (
              <button type="button" className="tcard-offer-btn" onClick={() => setOffering(true)}>
                {t("Offer")}
              </button>
            ) : null}
          </span>
        </div>
      </div>

      {/* Over the art and the plate, under the buttons; it never takes a click. */}
      {foil ? (
        <span className="cyc-foil" aria-hidden="true">
          <span className="cyc-foil-band" />
        </span>
      ) : null}
      <span className="cyc-glare" aria-hidden="true" />
      <span className="cyc-sweep" aria-hidden="true" />

      {pick === undefined ? null : (
        <button
          type="button"
          className="tcard-pick"
          aria-pressed={pick.on}
          aria-label={t(pick.on ? "Remove {name} from the bulk buy" : "Add {name} to the bulk buy", { name })}
          onClick={pick.toggle}
        >
          <span className="tcard-pick-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      )}

      {offering ? (
        <OfferDialog collection={collection} tokenId={token.id} name={name} onClose={() => setOffering(false)} />
      ) : null}
    </article>
  );
}
