"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { ValueChainCollectionAbi, ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { useTokenMetadata, trait } from "@/hooks/useCollection";
import { usePreviewSale, useTrade } from "@/hooks/useTrade";
import { Offers } from "@/components/Offers";
import { ShareLink } from "@/components/ShareLink";
import { formatSoso, resolveMediaUrl, shortAddress } from "@/lib/format";
import "@/styles/token.css";

export function TokenView({
  params,
}: {
  params: Promise<{ address: string; id: string }>;
}) {
  const { address: collectionParam, id } = use(params);
  const collection = /^0x[0-9a-fA-F]{40}$/.test(collectionParam)
    ? (collectionParam as `0x${string}`)
    : undefined;
  const tokenId = (() => {
    try {
      return BigInt(id);
    } catch {
      return undefined;
    }
  })();

  const { address } = useAccount();
  const { data: metadata, isLoading } = useTokenMetadata(collection, tokenId);
  const trade = useTrade(collection);
  const [price, setPrice] = useState("");

  const { data: owner } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "ownerOf",
    args: tokenId === undefined ? undefined : [tokenId],
    query: { enabled: tokenId !== undefined && collection !== undefined },
  });

  const { data: listing, refetch: refetchListing } = useReadContract({
    address: deployment.marketplace,
    abi: ValueChainMarketplaceAbi,
    functionName: "getListing",
    args: tokenId === undefined || collection === undefined ? undefined : [collection, tokenId],
    query: { enabled: tokenId !== undefined && collection !== undefined, refetchInterval: 12_000 },
  });

  const { data: active } = useReadContract({
    address: deployment.marketplace,
    abi: ValueChainMarketplaceAbi,
    functionName: "isListingActive",
    args: tokenId === undefined || collection === undefined ? undefined : [collection, tokenId],
    query: { enabled: tokenId !== undefined && collection !== undefined, refetchInterval: 12_000 },
  });

  const preview = usePreviewSale(collection, tokenId, price);

  if (tokenId === undefined || collection === undefined) {
    return (
      <section className="page section">
        <h1 className="token-title">That isn&rsquo;t a valid token.</h1>
        <Link className="btn" href="/">
          Back to the marketplace
        </Link>
      </section>
    );
  }

  const isOwner =
    owner !== undefined && address !== undefined && (owner as string).toLowerCase() === address.toLowerCase();
  const listed = listing !== undefined && (listing as { seller: string }).seller !== "0x0000000000000000000000000000000000000000";
  const listPrice = listed ? (listing as { price: bigint }).price : 0n;
  const image = resolveMediaUrl(metadata?.image);

  const afterAction = () => {
    void refetchListing();
    void trade.refetchApproval();
  };

  return (
    <section className="page section">
      <div className="token-grid">
        <figure className="token-figure">
          {image !== undefined ? (
            <img src={image} alt={metadata?.name ?? `Token ${id}`} />
          ) : (
            <div className="token-placeholder skeleton" />
          )}
        </figure>

        <div className="token-detail">
          <div className="token-head">
            <Link href={`/collection/${collectionParam}`} className="token-crumb">
              &larr; Back to the collection
            </Link>
            <h1 className="token-title">{metadata?.name ?? (isLoading ? "Loading…" : `Token #${id}`)}</h1>
            <div className="token-chips">
              {trait(metadata, "Tier") !== undefined ? (
                <span className={`chip chip-${trait(metadata, "Tier")?.toLowerCase()}`}>
                  {trait(metadata, "Tier")}
                </span>
              ) : null}
              {trait(metadata, "Edition") !== undefined ? (
                <span className="chip">{trait(metadata, "Edition")}</span>
              ) : null}
              {isOwner ? <span className="chip chip-up">You own this</span> : null}
              <ShareLink title={metadata?.name} />
            </div>
          </div>

          <dl className="token-facts">
            <div>
              <dt>Owner</dt>
              <dd className="mono">
                {owner === undefined ? "—" : isOwner ? "You" : shortAddress(owner as string, 6)}
              </dd>
            </div>
            <div>
              <dt>Token id</dt>
              <dd className="mono">#{id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{listed ? (active === true ? "For sale" : "Listed (stale)") : "Not listed"}</dd>
            </div>
          </dl>

          {/* --- the trading panel ------------------------------------- */}
          <div className="token-panel card">
            {listed ? (
              <>
                <div className="token-price-row">
                  <span className="dim">Price</span>
                  <span className="token-price mono">{formatSoso(listPrice)} SOSO</span>
                </div>

                {active === false ? (
                  <p className="token-warn">
                    This listing is stale — the owner moved the token or withdrew the
                    marketplace&rsquo;s approval. Buying it would fail, so the button is disabled.
                  </p>
                ) : null}

                {isOwner ? (
                  <button
                    className="btn btn-block"
                    disabled={trade.busy}
                    onClick={() => {
                      trade.cancel(tokenId);
                      afterAction();
                    }}
                  >
                    {trade.busy ? "Cancelling…" : "Cancel listing"}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-lg btn-block"
                    disabled={trade.busy || active !== true || address === undefined}
                    onClick={() => {
                      trade.buy(tokenId, listPrice);
                      afterAction();
                    }}
                  >
                    {address === undefined
                      ? "Connect wallet to buy"
                      : trade.signing
                        ? "Confirm in wallet…"
                        : trade.confirming
                          ? "Buying…"
                          : `Buy for ${formatSoso(listPrice)} SOSO`}
                  </button>
                )}
              </>
            ) : isOwner ? (
              <>
                <p className="token-panel-title">Sell this piece</p>

                <div className="field">
                  <label htmlFor="price">Price in SOSO</label>
                  <input
                    id="price"
                    className="input"
                    inputMode="decimal"
                    placeholder="0.05"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>

                {preview.price > 0n ? (
                  <dl className="token-split">
                    <div>
                      <dt>You receive</dt>
                      <dd className="mono">{formatSoso(preview.proceeds)}</dd>
                    </div>
                    <div>
                      <dt>Royalty</dt>
                      <dd className="mono">{formatSoso(preview.royalty)}</dd>
                    </div>
                    <div>
                      <dt>Marketplace</dt>
                      <dd className="mono">{formatSoso(preview.fee)}</dd>
                    </div>
                  </dl>
                ) : null}

                {trade.needsApproval ? (
                  <>
                    <p className="token-note">
                      The marketplace needs permission to move this token when it sells. Your token
                      stays in your wallet either way — this is one transaction, once per collection.
                    </p>
                    <button
                      className="btn btn-primary btn-block"
                      disabled={trade.busy}
                      onClick={() => {
                        trade.approve();
                        afterAction();
                      }}
                    >
                      {trade.busy ? "Approving…" : "Approve marketplace"}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary btn-lg btn-block"
                    disabled={trade.busy || preview.price <= 0n}
                    onClick={() => {
                      trade.list(tokenId, price);
                      afterAction();
                    }}
                  >
                    {trade.signing ? "Confirm in wallet…" : trade.confirming ? "Listing…" : "List for sale"}
                  </button>
                )}
              </>
            ) : (
              <p className="token-note">
                Not listed for sale. Only its owner can set a price &mdash; but anyone can
                make an offer below.
              </p>
            )}

            {trade.error !== null ? (
              <p className="token-error">
                {/rejected|denied|User denied/i.test(trade.error.message)
                  ? "You cancelled the transaction."
                  : trade.error.message.slice(0, 180)}
              </p>
            ) : null}
          </div>

          {collection === undefined ? null : (
            <Offers
              collection={collection}
              tokenId={tokenId}
              isOwner={isOwner}
              onChange={afterAction}
            />
          )}

          {metadata?.attributes !== undefined ? (
            <div className="token-traits">
              <p className="eyebrow">Traits</p>
              <div className="token-trait-grid">
                {metadata.attributes.map((a) => (
                  <div key={a.trait_type} className="token-trait">
                    <dt>{a.trait_type}</dt>
                    <dd>{String(a.value)}</dd>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <a
            className="token-explorer"
            href={`${deployment.explorer}/token/${collectionParam}/instance/${id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on the block explorer &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}
