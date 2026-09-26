"use client";

import { useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { useOffersForToken, useOwnOfferExposure, useTraitOffers } from "@/hooks/useSeaportOrders";
import { boundsOf, rootKey, traitLabel, useTokenCriteria } from "@/hooks/useCriteria";
import { useSeaportFill, useSeaportTrade } from "@/hooks/useSeaportTrade";
import { useCanPayFeeInWsoso } from "@/hooks/useWsoso";
import { formatSoso } from "@/lib/format";
import { AddressLink } from "@/components/AddressLink";
import { currencyLabel, fulfillerOutlay } from "@/lib/seaport";
import { deployment } from "@/config/contracts";
import { FillBlocked } from "@/components/FillBlocked";
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
  const { offers: direct, logsUnavailable } = useOffersForToken(collection, tokenId);

  /**
   * Trait offers this piece can be sold into: only those whose set the server
   * says contains THIS token, each carrying the token's proof. A trait offer
   * for a trait this piece does not have never appears here — and could not be
   * filled if it did, because Seaport checks the proof against the root.
   */
  const { offers: traitAll } = useTraitOffers(collection);
  const { byRoot: memberships } = useTokenCriteria(collection, tokenId, boundsOf(traitAll));
  const offers = useMemo(() => {
    const trait = traitAll.flatMap((o) => {
      const m = o.criteria === undefined ? undefined : memberships.get(rootKey(o.criteria));
      return m === undefined ? [] : [{ ...o, trait: traitLabel(m), proof: m.proof }];
    });
    return [...direct.map((o) => ({ ...o, trait: undefined, proof: undefined })), ...trait].sort((a, b) =>
      b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0,
    );
  }, [direct, traitAll, memberships]);

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
  const isMine = (o: { maker: string }) =>
    address !== undefined && o.maker.toLowerCase() === address.toLowerCase();
  /** The best offer this holder could take: never their own. */
  const best = offers.find((o) => !isMine(o));
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

  const mine = offers.find(isMine);

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

      {mustApproveToken && best !== undefined ? (
        <p className="offers-approve-note">
          Before you can accept, the marketplace needs permission to move this piece when it
          sells. One transaction, once per collection — the piece stays in your wallet until
          somebody buys it.
        </p>
      ) : mustAllowFee && best !== undefined ? (
        <p className="offers-approve-note">
          {/* Leads with the goal, not the paperwork. "One more permission"
              answers a question nobody asked; what a seller wants to know is
              why accepting needs a second signature and whether it costs
              anything. */}
          Last step before you can accept. The marketplace fee comes out of what the buyer
          pays you, in WSOSO, so it needs permission to take that much — nothing leaves your
          wallet now, and you never have to hold WSOSO yourself.
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
            const mineRow = isMine(o);
            return (
              <li key={o.hash} className={`offers-row${mineRow ? " is-mine" : ""}`}>
                <span className="offers-price mono">
                  <Soso size={16} unit={currencyLabel(o.currency)}>
                    {formatSoso(o.priceWei)}
                  </Soso>
                </span>
                <span className="offers-who">
                  {mineRow ? "You" : <AddressLink address={o.maker} chars={4} />}
                  <span className="offers-when">
                    {o.trait !== undefined ? `${o.trait} · ` : o.tokenId === undefined ? "any piece · " : ""}
                    {whenExpires(o.endTime)}
                  </span>
                </span>

                {/* Your own bid is withdrawn, never accepted — even on a piece you
                    hold, which a collection or trait offer can match. */}
                {mineRow ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => trade.cancelOrder(o)}
                  >
                    Withdraw
                  </button>
                ) : isOwner ? (
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
                      else fill.acceptOffer(o, tokenId, o.proof);
                    }}
                  >
                    {/* Each rung names the step it performs AND where it leads.
                        "Allow fee" alone said what the click does and nothing
                        about why, so it read as an unexplained extra hurdle;
                        "Accept" alone would have been a lie on the rungs that
                        do not sell anything. */}
                    {mustApproveToken
                      ? "Approve, then accept"
                      : mustAllowFee
                        ? "Allow fee, then accept"
                        : "Accept offer"}
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Why an Accept did not reach the wallet. Without it the check refuses in
        silence, and a button that visibly does nothing is worse than the gas it
        saved.
      */}
      <FillBlocked blocked={fill.blocked} />

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
