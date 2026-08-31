"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { trait } from "@/hooks/useCollection";
import { useMultiTokenMetadata } from "@/hooks/useMultiMetadata";
import { useTrade } from "@/hooks/useTrade";
import { useMultiBalance, useMultiListings } from "@/hooks/useMultiToken";
import { TxResult } from "@/components/TxResult";
import { ShareLink } from "@/components/ShareLink";
import { Soso } from "@/components/Soso";
import { formatSoso, resolveMediaUrl, shortAddress } from "@/lib/format";
import "@/styles/token.css";

/**
 * The ERC-1155 token page.
 *
 * A separate view rather than a branch inside TokenView, because almost nothing
 * carries over. ERC-721 has one owner, one listing and one price; a 1155 id has
 * a set of holders, a set of listings at different prices, and a quantity on
 * every action. The page is answering a different question - "who is selling
 * this, and how many do I want" rather than "is this for sale".
 *
 * What it deliberately does not offer is an offer button. `makeOffer` is
 * ERC-721 only on the contract, and showing a control that always reverts is
 * worse than not showing one.
 */
export function MultiTokenView({
  collection,
  tokenId,
}: {
  collection: `0x${string}`;
  tokenId: bigint;
}) {
  const { address } = useAccount();
  const { data: metadata, isLoading } = useMultiTokenMetadata(collection, tokenId);
  const trade = useTrade(collection);
  const { listings, isLoading: loadingListings, refetch: refetchListings } = useMultiListings(
    collection,
    tokenId,
  );
  const { balance, needsApproval, refetch: refetchBalance } = useMultiBalance(collection, tokenId);

  const [sellAmount, setSellAmount] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [buyAmounts, setBuyAmounts] = useState<Record<string, string>>({});

  // On the receipt, never on the click — see the note in TokenView.
  useEffect(() => {
    if (trade.isSuccess) {
      refetchListings();
      refetchBalance();
      void trade.refetchApproval();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash]);

  const image = resolveMediaUrl(metadata?.image);
  const mine = listings.find((l) => address !== undefined && l.seller.toLowerCase() === address.toLowerCase());
  const cheapest = listings[0];

  const wantedToSell = (() => {
    try {
      return BigInt(sellAmount || "0");
    } catch {
      return 0n;
    }
  })();

  return (
    <section className="page section">
      <Link className="token-back" href={`/collection/${collection}`}>
        &larr; Back to the collection
      </Link>

      <div className="token-layout">
        <div className="token-art card">
          {image === undefined ? (
            <div className="token-art-empty">{isLoading ? "Loading…" : "No artwork"}</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={metadata?.name ?? `#${tokenId}`} />
          )}
        </div>

        <div className="token-side">
          <h1 className="token-title">{metadata?.name ?? `#${tokenId}`}</h1>

          <div className="token-badges">
            <span className="chip">Edition token</span>
            {balance > 0n ? <span className="chip chip-own">You hold {balance.toString()}</span> : null}
            <ShareLink />
          </div>

          <dl className="token-facts">
            <div>
              <dt>Token ID</dt>
              <dd>#{tokenId.toString()}</dd>
            </div>
            <div>
              <dt>Sellers</dt>
              <dd>{loadingListings ? "…" : listings.length}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>
                {cheapest === undefined ? (
                  "Not listed"
                ) : (
                  <Soso size={16}>{formatSoso(cheapest.unitPrice)}</Soso>
                )}
              </dd>
            </div>
          </dl>

          {/* ------------------------------------------------------ buying */}
          <div className="token-panel card">
            <p className="token-panel-title">
              {listings.length === 0 ? "Nobody is selling this yet" : "For sale"}
            </p>

            {listings.length === 0 ? (
              <p className="token-note">
                This is an edition, so any holder can list some of theirs. When they do, every
                open offer shows here with its own price.
              </p>
            ) : (
              <ul className="multi-list">
                {listings.map((l) => {
                  const isMine = address !== undefined && l.seller.toLowerCase() === address.toLowerCase();
                  const raw = buyAmounts[l.seller] ?? "1";
                  let want = 0n;
                  try {
                    want = BigInt(raw || "0");
                  } catch {
                    want = 0n;
                  }
                  const valid = want > 0n && want <= l.amount;

                  return (
                    <li key={l.seller} className="multi-row">
                      <div className="multi-row-head">
                        <Soso size={16}>{formatSoso(l.unitPrice)}</Soso>
                        <span className="multi-unit">each</span>
                        <span className="multi-left">{l.amount.toString()} left</span>
                      </div>
                      <p className="multi-seller">
                        {isMine ? "Your listing" : `Seller ${shortAddress(l.seller)}`}
                      </p>

                      {isMine ? (
                        <button
                          type="button"
                          className="btn btn-block"
                          disabled={trade.busy}
                          onClick={() => trade.cancelMultiListing(tokenId)}
                        >
                          {trade.busy ? "Working…" : "Cancel listing"}
                        </button>
                      ) : (
                        <div className="multi-buy">
                          <input
                            inputMode="numeric"
                            aria-label="How many to buy"
                            value={raw}
                            onChange={(e) =>
                              setBuyAmounts((m) => ({
                                ...m,
                                [l.seller]: e.target.value.replace(/[^0-9]/g, ""),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={trade.busy || !valid || address === undefined}
                            onClick={() => trade.buyMulti(tokenId, l.seller, want, l.unitPrice)}
                          >
                            {address === undefined
                              ? "Connect a wallet"
                              : !valid
                                ? `Up to ${l.amount}`
                                : `Buy ${want} for ${formatEther(l.unitPrice * want)} SOSO`}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ------------------------------------------------------ selling */}
          {balance > 0n && mine === undefined ? (
            <div className="token-panel card">
              <p className="token-panel-title">Sell some of yours</p>

              {needsApproval ? (
                <>
                  <p className="token-note">
                    The marketplace needs permission to move these when they sell. They stay in
                    your wallet either way — one transaction, once per collection.
                  </p>
                  <button
                    className="btn btn-primary btn-block"
                    disabled={trade.busy}
                    onClick={() => trade.approve()}
                  >
                    {trade.busy ? "Approving…" : "Approve marketplace"}
                  </button>
                </>
              ) : (
                <>
                  <div className="multi-fields">
                    <label>
                      <span className="offers-label">How many</span>
                      <input
                        inputMode="numeric"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      />
                    </label>
                    <label>
                      <span className="offers-label">Price each</span>
                      <div className="field-suffix">
                        <input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                        />
                        <span>SOSO</span>
                      </div>
                    </label>
                  </div>

                  <p className="token-note">
                    You hold {balance.toString()}. Listings stand for 90 days and you can cancel
                    at any time; a buyer may take some rather than all of them.
                  </p>

                  <button
                    className="btn btn-primary btn-lg btn-block"
                    disabled={
                      trade.busy ||
                      wantedToSell <= 0n ||
                      wantedToSell > balance ||
                      unitPrice === "" ||
                      Number(unitPrice) <= 0
                    }
                    onClick={() => trade.listMulti(tokenId, wantedToSell, unitPrice)}
                  >
                    {trade.signing
                      ? "Confirm in wallet…"
                      : trade.confirming
                        ? "Listing…"
                        : wantedToSell > balance
                          ? `You only hold ${balance}`
                          : "List for sale"}
                  </button>
                </>
              )}
            </div>
          ) : null}

          <TxResult
            hash={trade.hash}
            confirming={trade.confirming}
            success={trade.isSuccess}
            error={trade.error}
            successLabel="Done"
          />

          {metadata?.attributes !== undefined && metadata.attributes.length > 0 ? (
            <div className="token-panel card">
              <p className="token-panel-title">Traits</p>
              <dl className="token-traits">
                {metadata.attributes.map((a) => (
                  <div key={a.trait_type}>
                    <dt>{a.trait_type}</dt>
                    <dd>{trait(metadata, a.trait_type) ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
