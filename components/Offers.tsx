"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useOffers } from "@/hooks/useOffers";
import { useTrade } from "@/hooks/useTrade";
import { formatSoso, shortAddress } from "@/lib/format";
import { OfferForm, useTokenOfferTarget } from "@/components/OfferForm";
import { TxResult } from "@/components/TxResult";
import "./Offers.css";
import { Soso } from "@/components/Soso";

export function whenExpires(expiry: bigint): string {
  if (expiry === 0n) return "no expiry";
  const secs = Number(expiry) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "expired";
  const days = Math.floor(secs / 86_400);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(secs / 3600);
  return hours >= 1 ? `${hours}h left` : "under an hour";
}

/**
 * Offers on one token: what stands, and the form to add to it.
 *
 * The contract has had `makeOffer`, `acceptOffer` and `withdrawOffer` since it
 * was deployed, with expiry and slippage guards, and nothing in the app ever
 * called them. Until recently an unlisted token was a dead end that said only
 * its owner could list it - true, and useless to someone who wants to buy it.
 *
 * Offers are denominated in WSOSO because the marketplace refuses native ones:
 * an allowance leaves the money in the bidder's wallet, so an offer can stand
 * indefinitely without the marketplace ever holding funds.
 *
 * The form itself lives in `OfferForm`, shared with the dialog a card opens.
 */
export function Offers({
  collection,
  tokenId,
  isOwner,
  onChange,
}: {
  collection: `0x${string}`;
  tokenId: bigint;
  isOwner: boolean;
  onChange: () => void;
}) {
  const { isConnected } = useAccount();
  const { offers, mine, refetch } = useOffers(collection, tokenId);

  /** Only accept and withdraw run from here; the form owns its own writes. */
  const trade = useTrade(collection);
  const offerTarget = useTokenOfferTarget(collection, tokenId);

  const after = () => {
    onChange();
    void refetch();
    // Approving is one of the writes that lands here, and it is the one that
    // changes what the buttons below should say.
    void trade.refetchApproval();
  };

  /**
   * Accepting moves the token, so the marketplace needs the same approval
   * listing needs — and `acceptOffer` reverts without it.
   *
   * This panel did not ask for it. Listing did, on the same page, a few inches
   * up, so an owner who had listed before never saw the gap; an owner who had
   * only ever been offered on saw an Accept button that failed in the wallet
   * with a bare revert. The approval is per collection and permanent, which is
   * why one holder can hit this and another never does.
   */
  const mustApprove = isOwner && trade.needsApproval;

  // On the receipt, never on the click - see the note in TokenView.
  useEffect(() => {
    if (trade.isSuccess) after();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash]);

  return (
    <div className="offers">
      <div className="offers-head">
        <p className="eyebrow">Offers</p>
        {offers.length > 0 ? (
          <span className="offers-count">
            {offers.length} live &middot; best {formatSoso(offers[0]!.price)} WSOSO
          </span>
        ) : null}
      </div>

      {mustApprove && offers.length > 0 ? (
        <p className="offers-approve-note">
          Before you can accept, the marketplace needs permission to move this piece when it
          sells. One transaction, once per collection — the piece stays in your wallet until
          somebody buys it.
        </p>
      ) : null}

      {offers.length === 0 ? (
        <p className="offers-empty">No offers yet.</p>
      ) : (
        <ul className="offers-list">
          {offers.map((o) => (
            <li key={o.bidder} className={`offers-row${o.mine ? " is-mine" : ""}`}>
              <span className="offers-price mono">
                <Soso size={16} unit="WSOSO">
                  {formatSoso(o.price)}
                </Soso>
              </span>
              <span className="offers-who">
                {o.mine ? "You" : shortAddress(o.bidder, 4)}
                <span className="offers-when">{whenExpires(o.expiry)}</span>
              </span>

              {isOwner ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={trade.busy}
                  /* The price seen is passed as the floor: a bidder can overwrite
                     their own offer downward, and the contract reverts rather
                     than settling at the lower number. */
                  onClick={() =>
                    mustApprove ? trade.approve() : trade.acceptOffer(tokenId, o.bidder, o.price)
                  }
                >
                  {mustApprove ? "Approve first" : "Accept"}
                </button>
              ) : o.mine ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={trade.busy}
                  onClick={() => trade.withdrawOffer(tokenId)}
                >
                  Withdraw
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Accepting or withdrawing reports here; the form reports inside itself. */}
      <TxResult
        hash={trade.hash}
        confirming={trade.confirming}
        success={trade.isSuccess}
        error={trade.error}
        successLabel="Done"
      />

      {isOwner || !isConnected ? null : (
        <div className="offers-make-wrap">
          <p className="offers-make-title">
            {mine === undefined ? "Make an offer" : "Replace your offer"}
          </p>
          <OfferForm target={offerTarget} replacing={mine !== undefined} onDone={after} />
        </div>
      )}
    </div>
  );
}
