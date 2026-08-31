"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOffers } from "@/hooks/useOffers";
import { OfferForm } from "@/components/OfferForm";
import { formatSoso, shortAddress } from "@/lib/format";
import { whenExpires } from "@/components/Offers";
import "./OfferDialog.css";
import { Soso } from "@/components/Soso";

/**
 * Make an offer without leaving the page.
 *
 * Offers only existed on the token detail page, which meant the only way to
 * reach one was to open a token, and nobody does that for something they cannot
 * buy. Bringing the form to the card is what makes the feature findable.
 *
 * Portalled to `document.body` for the same reason `WalletPicker` is: cards sit
 * inside grids and sections that establish containing blocks, and a fixed
 * dialog rendered in place would centre itself against the nearest one.
 */
export function OfferDialog({
  collection,
  tokenId,
  name,
  onClose,
}: {
  collection: `0x${string}`;
  tokenId: bigint;
  name: string;
  onClose: () => void;
}) {
  const { offers, mine } = useOffers(collection, tokenId);
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

  return createPortal(
    <>
      <div className="od-scrim" onClick={onClose} aria-hidden="true" />
      <div className="od" role="dialog" aria-modal="true" aria-label={`Make an offer on ${name}`}>
        <div className="od-head">
          <div>
            <p className="od-kicker">Make an offer</p>
            <h2>{name}</h2>
          </div>
          <button type="button" className="od-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="od-body">
          {offers.length > 0 ? (
            <ul className="od-standing">
              {offers.slice(0, 3).map((o) => (
                <li key={o.bidder}>
                  <span className="mono">
                    <Soso size={16} unit="WSOSO">
                      {formatSoso(o.price)}
                    </Soso>
                  </span>
                  <span>
                    {o.mine ? "You" : shortAddress(o.bidder, 4)} &middot; {whenExpires(o.expiry)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="od-empty">No offers on this one yet.</p>
          )}

          <OfferForm
            collection={collection}
            tokenId={tokenId}
            replacing={mine !== undefined}
            onDone={() => undefined}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
