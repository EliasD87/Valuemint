"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useOffersForToken, useOwnOfferExposure } from "@/hooks/useSeaportOrders";
import { useSeaportFill, useSeaportTrade } from "@/hooks/useSeaportTrade";
import { useCanPayFeeInWsoso } from "@/hooks/useWsoso";
import { formatSoso, shortAddress } from "@/lib/format";
import { currencyLabel, fulfillerOutlay } from "@/lib/seaport";
import { deployment } from "@/config/contracts";
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
 * Both kinds appear here — bids naming this exact piece, and bids on the whole
 * collection that this piece satisfies. Keeping them in separate lists is what
 * made a collection offer look unacceptable on every token's page, which is the
 * bug that started this rebuild: an offer on SoDex Larpers #1 that five wallets
 * holding other Larpers could see and none could take.
 *
 * Offers are denominated in WSOSO because an allowance leaves the money in the
 * bidder's wallet. Native currency cannot be pulled, so the alternative would be
 * a contract holding everyone's bids.
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
  const { address, isConnected } = useAccount();
  const { offers, logsUnavailable } = useOffersForToken(collection, tokenId);

  /** Only accept and withdraw run from here; the form owns its own writes. */
  const trade = useSeaportTrade(collection);
  const fill = useSeaportFill();
  const offerTarget = useTokenOfferTarget(collection, tokenId);

  /**
   * Accepting costs the holder two permissions, and the second one is new.
   *
   * The NFT approval is the familiar one: Seaport cannot move the piece without
   * it. The WSOSO allowance is not — Seaport pays the bid to the holder and then
   * pulls the marketplace fee back out of it, so the holder needs an allowance
   * even though they never need a balance. The previous marketplace took its cut
   * from the money in flight and never asked, so this step is easy to forget and
   * fails as a bare wallet revert when it is.
   */
  const best = offers[0];
  // What this order actually charges, not what our own fee rate would be.
  const feeOnBest = best === undefined ? 0n : fulfillerOutlay(best.params);
  /**
   * Allowances are exact, so approving for the fee alone would revoke the cover
   * for any bid this wallet has standing elsewhere. Ask for both together.
   */
  const ownBids = useOwnOfferExposure(address, deployment.wsoso as `0x${string}`);
  const feeAllowance = useCanPayFeeInWsoso(isOwner ? feeOnBest : 0n, ownBids);

  const after = () => {
    onChange();
    void trade.refetchApproval();
    void trade.refetchCounter();
    feeAllowance.refetch();
  };

  const mustApproveToken = isOwner && trade.needsApproval;
  const mustAllowFee = isOwner && !mustApproveToken && feeAllowance.needsAllowance;
  const busy = trade.busy || fill.busy || feeAllowance.busy;

  // On the receipt, never on the click - see the note in TokenView.
  useEffect(() => {
    if (trade.isSuccess || fill.isSuccess || feeAllowance.isSuccess) after();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash, fill.isSuccess, fill.hash, feeAllowance.isSuccess]);

  const mine = offers.find(
    (o) => address !== undefined && o.maker.toLowerCase() === address.toLowerCase(),
  );

  return (
    <div className="offers">
      <div className="offers-head">
        <p className="eyebrow">Offers</p>
        {offers.length > 0 ? (
          <span className="offers-count">
            {/* Derived, not a literal. The whitelist guarantees WSOSO today, so
                this is not exploitable — but a hardcoded unit beside a number
                is exactly the shape that rendered an attacker's worthless token
                as "1,000,000 WSOSO" to a holder about to accept it. */}
            {offers.length} live &middot; best {formatSoso(offers[0]!.priceWei)}{" "}
            {currencyLabel(offers[0]!.currency)}
          </span>
        ) : null}
      </div>

      {mustApproveToken && offers.length > 0 ? (
        <p className="offers-approve-note">
          Before you can accept, the marketplace needs permission to move this piece when it
          sells. One transaction, once per collection — the piece stays in your wallet until
          somebody buys it.
        </p>
      ) : mustAllowFee && offers.length > 0 ? (
        <p className="offers-approve-note">
          One more permission: the marketplace fee is taken in WSOSO out of what you are paid.
          Nothing leaves your wallet now, and you never need to hold WSOSO yourself.
        </p>
      ) : null}

      {offers.length === 0 && logsUnavailable ? (
        /* "No offers yet" is a claim about the chain. When the node refused the
           logs we have not established it — and a holder who believes there are
           no bids on their piece makes different decisions than one who knows
           we could not look. */
        <p className="offers-empty">
          Offers could not be loaded just now — the node would not serve event logs.
          This does not mean there are none.
        </p>
      ) : offers.length === 0 ? (
        <p className="offers-empty">No offers yet.</p>
      ) : (
        <ul className="offers-list">
          {offers.map((o) => {
            const isMine =
              address !== undefined && o.maker.toLowerCase() === address.toLowerCase();
            return (
              <li key={o.hash} className={`offers-row${isMine ? " is-mine" : ""}`}>
                <span className="offers-price mono">
                  <Soso size={16} unit={currencyLabel(o.currency)}>
                    {formatSoso(o.priceWei)}
                  </Soso>
                </span>
                <span className="offers-who">
                  {isMine ? "You" : shortAddress(o.maker, 4)}
                  <span className="offers-when">
                    {o.tokenId === undefined ? "any piece · " : ""}
                    {whenExpires(o.endTime)}
                  </span>
                </span>

                {isOwner ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    /**
                     * No price guard is needed here. A Seaport order is immutable
                     * — a bidder cannot lower an offer in place, only cancel it
                     * and make another, which is a different order with a
                     * different hash. The previous marketplace needed `minPrice`
                     * precisely because its offers could be overwritten downward
                     * in the block before an accept landed.
                     */
                    onClick={() => {
                      if (mustApproveToken) trade.approve();
                      else if (mustAllowFee) feeAllowance.allow();
                      else fill.acceptOffer(o, tokenId);
                    }}
                  >
                    {mustApproveToken ? "Approve first" : mustAllowFee ? "Allow fee" : "Accept"}
                  </button>
                ) : isMine ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => trade.cancelOrder(o)}
                  >
                    Withdraw
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Accepting or withdrawing reports here; the form reports inside itself. */}
      <TxResult
        hash={fill.hash ?? trade.hash}
        confirming={fill.confirming || trade.confirming}
        success={fill.isSuccess || trade.isSuccess}
        error={fill.error ?? trade.error ?? feeAllowance.error}
        successLabel="Done"
      />

      {isOwner || !isConnected ? null : (
        <div className="offers-make-wrap">
          <p className="offers-make-title">
            {mine === undefined ? "Make an offer" : "Make another offer"}
          </p>
          <OfferForm target={offerTarget} replacing={false} onDone={after} />
        </div>
      )}
    </div>
  );
}
