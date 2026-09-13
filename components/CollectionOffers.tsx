"use client";

import { useEffect, useMemo, useState } from "react";
import { erc721Abi } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import { whenExpires } from "@/components/Offers";
import { OfferForm, useCollectionOfferTarget } from "@/components/OfferForm";
import { collectionOffersEnabled, useCollectionOffers } from "@/hooks/useCollectionOffers";
import { useCollectionOfferTrade } from "@/hooks/useCollectionOfferTrade";
import { formatSoso, shortAddress } from "@/lib/format";
import "./CollectionOffers.css";

/**
 * Offers on the collection as a whole — the kind any holder can take.
 *
 * This is the answer to the complaint that started it: a bid landed on one
 * edition of a five-edition design, four holders could see the number and take
 * nothing, and the one who could was never told. An offer here names no token,
 * so whoever holds a piece and gets there first sells it.
 *
 * Renders nothing at all until the offers contract is deployed. Everything it
 * touches is gated on `collectionOffersEnabled`, which is how this shipped
 * before the contract existed.
 */

/**
 * Which of the viewer's pieces they would be handing over.
 *
 * The offer names no token, so this is genuinely the seller's choice and has to
 * be asked rather than assumed — someone holding #4 and #7 may well be keeping
 * one of them. `tokenOfOwnerByIndex` is how a holding is enumerated; a
 * collection without it reports a balance and no ids, and the panel says so
 * rather than guessing.
 */
const ownerIndexAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function useMyTokenIds(collection: `0x${string}` | undefined, viewer: `0x${string}` | undefined) {
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: collection,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: viewer === undefined ? undefined : [viewer],
    query: { enabled: collection !== undefined && viewer !== undefined },
  });

  const held = Number((balance as bigint | undefined) ?? 0n);
  // A wallet with hundreds in one collection does not need every id listed to
  // sell one, and asking for them all is a multicall nobody reads.
  const cap = Math.min(held, 24);

  const { data: raw, refetch: refetchIds } = useReadContracts({
    contracts: Array.from({ length: cap }, (_, i) => ({
      address: collection,
      abi: ownerIndexAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [viewer, BigInt(i)] as const,
    })),
    query: { enabled: collection !== undefined && viewer !== undefined && cap > 0 },
  });

  const ids = useMemo(() => {
    if (raw === undefined) return [];
    return raw
      .filter((r) => r.status === "success")
      .map((r) => r.result as bigint)
      .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  }, [raw]);

  return {
    held,
    ids,
    /** Held something, but the contract cannot say which — no Enumerable. */
    opaque: held > 0 && cap > 0 && raw !== undefined && ids.length === 0,
    refetch: () => {
      void refetchBalance();
      void refetchIds();
    },
  };
}

export function CollectionOffers({ collection }: { collection: `0x${string}` }) {
  const { address: viewer, isConnected } = useAccount();
  const { offers, mine, refetch } = useCollectionOffers(collection);
  const trade = useCollectionOfferTrade(collection);
  const target = useCollectionOfferTarget(collection);
  const holding = useMyTokenIds(collection, viewer);

  const [selling, setSelling] = useState<string>("");
  const chosen = selling !== "" ? selling : (holding.ids[0]?.toString() ?? "");

  const after = () => {
    void refetch();
    void trade.refetchApproval();
    holding.refetch();
  };

  // On the receipt, never on the click — see the note in TokenView.
  useEffect(() => {
    if (trade.isSuccess) after();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash]);

  if (!collectionOffersEnabled) return null;

  /** The best offer with money actually behind it — the only one worth taking. */
  const takeable = offers.find((o) => o.fillable && !o.mine);
  const canSell = holding.held > 0 && chosen !== "";

  return (
    <div className="cofs card">
      <div className="cofs-head">
        <div>
          <p className="eyebrow">Offers on any piece</p>
          <p className="cofs-sub">
            A bid on the collection, not on one token. Whoever holds a piece can take it.
          </p>
        </div>
        {offers.length > 0 ? (
          <span className="cofs-count">
            {offers.length} live &middot; best {formatSoso(offers[0]!.price)} WSOSO
          </span>
        ) : null}
      </div>

      {offers.length === 0 ? (
        <p className="cofs-empty">No collection-wide offers yet.</p>
      ) : (
        <ul className="cofs-list">
          {offers.map((o) => (
            <li key={o.bidder} className={`cofs-row${o.mine ? " is-mine" : ""}`}>
              <span className="cofs-price mono">
                <Soso size={16} unit="WSOSO">
                  {formatSoso(o.price)}
                </Soso>
              </span>
              <span className="cofs-who">
                {o.mine ? "You" : shortAddress(o.bidder, 4)}
                <span className="cofs-when">
                  {whenExpires(o.expiry)}
                  {o.fillable ? "" : " · not funded"}
                </span>
              </span>

              {o.mine ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={trade.busy}
                  onClick={() => trade.withdrawOffer()}
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

      {/* --- the holder's side ------------------------------------------- */}
      {takeable !== undefined && holding.held > 0 ? (
        <div className="cofs-sell">
          <p className="cofs-sell-title">
            You hold {holding.held === 1 ? "one piece" : `${holding.held} pieces`} here. Sell one for{" "}
            <b className="mono">{formatSoso(takeable.price)}</b> WSOSO?
          </p>

          {holding.opaque ? (
            <p className="cofs-fine">
              This collection doesn&rsquo;t publish a per-owner index, so the pieces you hold
              can&rsquo;t be listed here. Open one directly to sell it.
            </p>
          ) : (
            <div className="cofs-sell-row">
              <label className="cofs-pick">
                <span className="cofs-pick-label">Which one</span>
                <select
                  value={chosen}
                  onChange={(e) => setSelling(e.target.value)}
                  disabled={holding.ids.length < 2}
                >
                  {holding.ids.map((id) => (
                    <option key={id.toString()} value={id.toString()}>
                      #{id.toString()}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn btn-primary"
                disabled={trade.busy || !canSell}
                /* The price on screen is the floor: a bidder can overwrite their
                   own offer downward, and the contract refuses rather than
                   settling at the lower number. */
                onClick={() =>
                  trade.needsApproval
                    ? trade.approve()
                    : trade.acceptOffer(BigInt(chosen), takeable.bidder, takeable.price)
                }
              >
                {trade.busy
                  ? "Working…"
                  : trade.needsApproval
                    ? "Approve first"
                    : `Sell #${chosen}`}
              </button>
            </div>
          )}

          {trade.needsApproval && !holding.opaque ? (
            <p className="cofs-fine">
              Offers here settle through their own contract, so it needs its own permission to move
              a piece when you sell. One transaction, once per collection.
            </p>
          ) : null}

          <TxResult
            hash={trade.hash}
            confirming={trade.confirming}
            success={trade.isSuccess}
            error={trade.error}
            successLabel="Sold"
          />
        </div>
      ) : null}

      {/* --- the bidder's side ------------------------------------------- */}
      {isConnected ? (
        <div className="cofs-make">
          <p className="cofs-make-title">
            {mine === undefined ? "Offer on any piece" : "Replace your offer"}
          </p>
          <OfferForm target={target} replacing={mine !== undefined} onDone={after} />
        </div>
      ) : null}
    </div>
  );
}
