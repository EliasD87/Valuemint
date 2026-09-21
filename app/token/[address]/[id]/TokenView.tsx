"use client";

import { parseEther } from "viem";

import { use, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { SEAPORT } from "@/config/seaport";
import { useTokenMetadata, trait } from "@/hooks/useCollection";
import { tierClass, tierOf } from "@/lib/tokenMetadata";
import { useTokenStandard } from "@/hooks/useTokenStandard";
import { MultiTokenView } from "./MultiTokenView";
import { useSeaportFill, useSeaportTrade } from "@/hooks/useSeaportTrade";
import { useListingFor } from "@/hooks/useSeaportOrders";
import { splitFee } from "@/lib/seaport";
import { Offers } from "@/components/Offers";
import { TxResult } from "@/components/TxResult";
import { ShareLink } from "@/components/ShareLink";
import { formatSoso, resolveMediaUrl, shortAddress } from "@/lib/format";
import { MovingArt } from "@/components/MovingArt";
import { soleArtworkFor } from "@/config/covers";
import { Wordmark } from "@/components/Wordmark";
import { wordmarkSaying } from "@/config/wordmarks";
import "@/styles/token.css";
import { Activity, LastSale } from "@/components/Activity";


/**
 * The typed price as wei, or 0n if it is not a number yet.
 *
 * The preview used `BigInt(Math.round(Number(price) * 1e18))` while the order
 * itself is built with `parseEther`. The two agree for ordinary input and
 * diverge past ~15 significant digits, so the split shown to a seller was not
 * always the split they got. It also threw on a half-typed value — `parseEther`
 * rejects "0." and "1.2.3" — which is exactly what a controlled input contains
 * between keystrokes.
 */
function safeParseEther(value: string): bigint {
  if (value.trim() === "") return 0n;
  try {
    return parseEther(value);
  } catch {
    return 0n;
  }
}

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
  /**
   * Which page to render at all.
   *
   * Read before anything else, because the two standards disagree about the
   * basics: everything below this point calls `ownerOf` and assumes a single
   * listing, neither of which exists for an edition token. Hooks still run in a
   * fixed order - this one is unconditional and the delegation happens after
   * the rest are declared.
   */
  const { standard, isLoading: loadingStandard } = useTokenStandard(collection);
  const { data: metadata, isLoading, uri: tokenUri } = useTokenMetadata(collection, tokenId);

  /** The collection's drawn name, if this piece's name is the word it draws. */
  const titleMark = wordmarkSaying(collection, metadata?.name);

  /**
   * The collection's own `name()`, which is a different question from the
   * token's.
   *
   * A collection can publish no per-token metadata and still be perfectly
   * well named on chain - `name()` is mandatory ERC-721 Metadata and
   * TestSoDEXTreasureBox answers it fine. So "Token #4456" was throwing away
   * the one piece of identity that IS available. `TestSoDEXTreasureBox #4456`
   * is what the explorer and every other marketplace shows for the same piece.
   *
   * Above the early returns, like every hook in this component.
   */
  const { data: collectionName } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "name",
    query: { enabled: collection !== undefined, staleTime: Infinity, gcTime: Infinity },
  });
  const trade = useSeaportTrade(collection);
  const fill = useSeaportFill();
  const [price, setPrice] = useState("");

  /**
   * Which button was last pressed.
   *
   * The result banner used to take its wording from the panel's *state* rather
   * than from what happened: `successLabel={listed ? "Done" : "Listed"}`. So
   * approving — which is step one of two and lists nothing — reported "Listed."
   * while the piece was still unlisted and the real work had not begun. The
   * only thing that knows what a receipt means is the button that caused it.
   */
  const [lastAction, setLastAction] = useState<
    "approve" | "list" | "cancel" | "buy" | undefined
  >(undefined);

  const { data: owner, refetch: refetchOwner } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "ownerOf",
    args: tokenId === undefined ? undefined : [tokenId],
    /**
     * Polled, because this read decides more than a label.
     *
     * `owner` drives the Owner field, `active` (whether Buy is offered), and
     * `isOwner`, which is handed to `Offers` and gates every Accept button. It
     * had no `refetchInterval`, so on a page left open it was only ever as
     * fresh as the last mount or the last write — while the order book beside
     * it refreshed every 25-30s. A holder who sold elsewhere kept being offered
     * Accept, and a buyer kept being offered Buy against a token that had moved.
     */
    query: {
      enabled: tokenId !== undefined && collection !== undefined,
      refetchInterval: 25_000,
    },
  });

  const { listing, logsUnavailable } = useListingFor(collection, tokenId);

  /**
   * Whether the listing can actually be filled.
   *
   * Seaport holds no listing state of its own, so "stale" is not something the
   * order can tell us - the order stays perfectly valid while the seller walks
   * the token out of their wallet or revokes approval. Both are read from the
   * collection, and only a listing whose seller still holds the token and still
   * lets Seaport move it is offered as buyable.
   */
  const { data: sellerApproved, refetch: refetchApprovalState } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "isApprovedForAll",
    args: listing === undefined ? undefined : [listing.maker, SEAPORT],
    query: { enabled: listing !== undefined && collection !== undefined, refetchInterval: 15_000 },
  });

  /** What listing at the typed price would pay out. No contract call: it is arithmetic. */
  const preview = (() => {
    let asked = 0n;
    try {
      asked = price === "" ? 0n : safeParseEther(price);
    } catch {
      asked = 0n;
    }
    const { fee, net } = splitFee(asked);
    return { price: asked, proceeds: net, fee };
  })();

  /**
   * Lifted above the early returns below. It used to sit after them, so an
   * invalid token id rendered one fewer hook than every other path - React's
   * one hard rule. `afterAction` is declared further down; the effect body only
   * runs after the whole component function has, so the reference is live by
   * then.
   */
  useEffect(() => {
    if (trade.isSuccess || fill.isSuccess) afterAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash, fill.isSuccess, fill.hash]);

  /**
   * The listing is on chain but the order book has not seen it yet.
   *
   * A listing reaches the chain through `validate()`, and the book is rebuilt
   * from logs — which the scanner deliberately reads six confirmations behind
   * the head, then polls every thirty seconds. So for up to about forty
   * seconds after a successful list, the transaction has succeeded and
   * `listing` is still undefined.
   *
   * What the page did with that gap was contradict itself: STATUS said "Not
   * listed", the sell form reopened with the price still typed in it, and the
   * green "Listed." banner sat underneath. The obvious reading is that it did
   * not work, and the obvious response is to list again — which produces two
   * live orders at two prices, and a buyer takes the cheaper one.
   *
   * Cancelling has the same gap in the other direction.
   */
  const justListed = lastAction === "list" && trade.isSuccess && listing === undefined;
  const justCancelled = lastAction === "cancel" && trade.isSuccess && listing !== undefined;
  const settling = justListed || justCancelled;

  /**
   * Also lifted above the early returns, and for the same hard reason.
   *
   * These two used to sit below the `loadingStandard` and `erc1155` branches.
   * The first render of any token whose standard was not already cached takes
   * the loading branch and stops before them; the render after it runs the
   * whole body and reaches them. That is two extra hooks appearing on the
   * second render of the same component — React #310, "rendered more hooks
   * than during the previous render" — and it took the whole page down with
   * the error boundary rather than degrading. It only showed on collections
   * the app had not read a standard for yet, which is why it survived: every
   * first-party collection was warm.
   *
   * The lifted effect above this one carries the same note. A hook added to
   * this component goes ABOVE this line, always.
   */
  const queryClient = useQueryClient();

  /**
   * While a write is settling, chase it instead of waiting for the poll.
   *
   * The order book refetches every thirty seconds and reads six confirmations
   * behind the head, so a listing could take the better part of a minute to
   * appear — during which the page had already said "Listed." An immediate
   * refetch cannot help: the block is not readable yet. Asking every six
   * seconds until the book agrees turns roughly forty seconds into roughly
   * fifteen, and stops by itself the moment `settling` goes false.
   */
  useEffect(() => {
    if (!settling) return;
    const tick = () => {
      void queryClient.invalidateQueries({ queryKey: ["seaport-validated"] });
    };
    const interval = setInterval(tick, 6_000);
    // Give up after a minute rather than polling a page somebody left open.
    const stop = setTimeout(() => clearInterval(interval), 60_000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [settling, queryClient]);

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

  /**
   * Edition tokens get their own page. Everything below assumes `ownerOf` and a
   * single listing, and an ERC-1155 id has neither - it has a set of holders and
   * a listing per seller.
   *
   * Waiting on `loadingStandard` rather than guessing: rendering the ERC-721
   * page first and swapping would show "Owner —" and a dead Buy button for a
   * beat on every edition token.
   */
  if (loadingStandard) {
    return (
      <section className="page section">
        <div className="token-placeholder skeleton" />
      </section>
    );
  }
  if (standard === "erc1155") {
    return <MultiTokenView collection={collection} tokenId={tokenId} />;
  }

  const isOwner =
    owner !== undefined && address !== undefined && (owner as string).toLowerCase() === address.toLowerCase();
  const listed = listing !== undefined;

  const listPrice = listing?.priceWei ?? 0n;
  /** Fillable now: the seller still holds it, and Seaport is still allowed to move it. */
  const active =
    listing !== undefined &&
    sellerApproved === true &&
    owner !== undefined &&
    (owner as string).toLowerCase() === listing.maker.toLowerCase();
  /** One flag for both sides of the panel — making an order, and taking one. */
  const busy = trade.busy || fill.busy;
  /**
   * Our own copy where we ship one, the token's own metadata otherwise.
   * See `soleArtworkFor` — for these collections they are the same picture and
   * ours is a third of the frames.
   */
  const image = soleArtworkFor(collection) ?? resolveMediaUrl(metadata?.image);

  /**
   * The contract answered, and its answer was nothing.
   *
   * An empty `tokenURI` is not a slow gateway: there is no document to fetch,
   * anywhere. Rendering the shimmer for it promises something that never
   * arrives. `undefined` still means the read has not landed.
   */
  const noMetadata = tokenUri !== undefined && tokenUri.trim() === "";

  /**
   * Re-read the chain when a receipt lands — never when a button is clicked.
   *
   * This used to be called synchronously in each click handler, immediately
   * after `writeContract`. That call is fire-and-forget, so the refetch ran in
   * the same tick: before the wallet prompt had even been answered, let alone
   * before a block was mined. `isApprovedForAll` therefore still read false,
   * the button still said "Approve marketplace", and the obvious response was
   * to press it again — which is exactly the double approval that showed up in
   * real use. The approval had worked the first time; the page never noticed.
   *
   * Every read that a write can change belongs in here, and two were missing.
   *
   * `ownerOf` was the quieter one: it has no poll at all, so after a purchase
   * the page kept naming the previous owner until a manual reload.
   *
   * The listing itself is not refetched here. It comes from a log scan cached
   * across the whole app, and clearing that to pick up one order would throw
   * away the entire market's history; its own 30s poll finds the new order.
   * Staleness is checked separately — `sellerApproved` and `ownerOf` are what
   * decide whether a listing is buyable, and both are refreshed here.
   */
  const afterAction = () => {
    void refetchOwner();
    void refetchApprovalState();
    void trade.refetchApproval();
    void trade.refetchCounter();
  };

  return (
    <section className="page section">
      <div className="token-grid">
        <figure className="token-figure">
          {image !== undefined ? (
            /*
              Animated, and far lighter than the original.

              This rendered the source directly, which for Cybereator is a
              6.58 MB GIF served with `max-age=60`. Through the route it is a
              2.3 MB animated WebP, immutable for a year — the animation kept,
              because this is the one place a visitor is looking at a single
              piece on purpose. The cards take the 22 KB still instead.

              `MovingArt` rather than an `<img>` at that URL, because the first
              request for it takes ten seconds and the figure was empty for all
              of them. See the component.
            */
            <MovingArt src={image} alt={metadata?.name ?? `Token ${id}`} />
          ) : noMetadata ? (
            /* Nothing is loading here and nothing ever will. See `noMetadata`. */
            <div className="token-placeholder token-bare">
              <span>No artwork published</span>
              <small>
                {typeof collectionName === "string" && collectionName !== ""
                  ? `${collectionName} does not publish per-token metadata, `
                  : "This collection does not publish per-token metadata, "}
                so there is no picture or traits to show &mdash; only its creator can add
                them. The piece itself is real and trades normally.
              </small>
            </div>
          ) : (
            <div className="token-placeholder skeleton" />
          )}
        </figure>

        <div className="token-detail">
          <div className="token-head">
            <Link href={`/collection/${collectionParam}`} className="token-crumb">
              &larr; Back to the collection
            </Link>
            <h1 className="token-title">
              {/*
                `wordmarkSaying`, because this is the PIECE's name rather than
                the collection's — Cybereator ships one design, so all thousand
                read "Cybereator", but a collection with two would not. The
                fallback below composes "<collection> #<id>", which no mark
                spells, so it is refused there without needing to be excluded.

                Inside the heading rather than replacing it: the mark carries
                `role="img"` and its own label, so the h1's accessible name is
                still the piece's name, and the drawing takes the heading's
                font-size for its `em` sizing.
              */}
              {titleMark !== undefined && metadata?.name !== undefined ? (
                <Wordmark mark={titleMark} name={metadata.name} />
              ) : (
                (metadata?.name ??
                (isLoading
                  ? "Loading…"
                  : `${typeof collectionName === "string" && collectionName !== "" ? collectionName : "Token"} #${id}`))
              )}
            </h1>
            <div className="token-chips">
              {tierOf(metadata) !== undefined ? (
                <span className={`chip chip-${tierClass(tierOf(metadata))}`}>
                  {tierOf(metadata)}
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
              <dd>
                {settling
                  ? justListed
                    ? "Listing…"
                    : "Cancelling…"
                  : listed
                    ? active
                      ? "For sale"
                      : "Listed (stale)"
                    : logsUnavailable
                      ? "Unknown"
                      : "Not listed"}
              </dd>
              <LastSale collection={collection} tokenId={tokenId} />
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

                {!active ? (
                  <p className="token-warn">
                    This listing is stale — the owner moved the token or withdrew the
                    marketplace&rsquo;s approval. Buying it would fail, so the button is disabled.
                  </p>
                ) : null}

                {isOwner ? (
                  <button
                    className="btn btn-block"
                    disabled={busy}
                    onClick={() => {
                      setLastAction("cancel");
                      if (listing !== undefined) trade.cancelOrder(listing);
                    }}
                  >
                    {trade.busy ? "Cancelling…" : "Cancel listing"}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-lg btn-block"
                    disabled={busy || !active || address === undefined}
                    onClick={() => {
                      setLastAction("buy");
                      if (listing !== undefined) fill.buy(listing);
                    }}
                  >
                    {address === undefined
                      ? "Connect wallet to buy"
                      : fill.signing
                        ? "Confirm in wallet…"
                        : fill.confirming
                          ? "Buying…"
                          : `Buy for ${formatSoso(listPrice)} SOSO`}
                  </button>
                )}
              </>
            ) : settling ? (
              <p className="token-note">
                {justListed
                  ? "Your listing is on chain. It takes up to a minute to appear in the market, because the book is rebuilt from confirmed blocks. Do not list it again — you would end up with two live listings at different prices."
                  : "Your cancellation is on chain and the listing will stop showing shortly."}
              </p>
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
                      <dt>Marketplace</dt>
                      <dd className="mono">{formatSoso(preview.fee)}</dd>
                    </div>
                  </dl>
                ) : null}

                {/**
                 * Listing is two transactions the first time, and saying so up
                 * front is the whole point. Someone who is told "one
                 * transaction" and then asked for a second one reasonably
                 * assumes the first failed — which is how a double approval
                 * happens.
                 */}
                {trade.needsApproval || lastAction === "approve" ? (
                  <ol
                    className="token-steps"
                    aria-label={`Listing: step ${trade.needsApproval ? 1 : 2} of 2`}
                  >
                    <li className={trade.needsApproval ? "is-now" : "is-done"}>
                      <span className="token-step-n" aria-hidden="true">
                        {trade.needsApproval ? "1" : "✓"}
                      </span>
                      Approve once
                    </li>
                    <li className={trade.needsApproval ? "" : "is-now"}>
                      <span className="token-step-n" aria-hidden="true">
                        2
                      </span>
                      List it
                    </li>
                  </ol>
                ) : null}

                {trade.needsApproval ? (
                  <>
                    <p className="token-note">
                      The marketplace needs permission to move this token when it sells. Your token
                      stays in your wallet either way — this is one transaction, once per collection.
                    </p>
                    <button
                      className="btn btn-primary btn-block"
                      disabled={busy}
                      onClick={() => {
                        setLastAction("approve");
                        trade.approve();
                      }}
                    >
                      {trade.busy ? "Approving…" : "Approve marketplace"}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary btn-lg btn-block"
                    disabled={busy || preview.price <= 0n}
                    onClick={() => {
                      setLastAction("list");
                      trade.list(tokenId, price);
                    }}
                  >
                    {trade.signing ? "Confirm in wallet…" : trade.confirming ? "Listing…" : "List for sale"}
                  </button>
                )}
              </>
            ) : logsUnavailable ? (
              /* A seller told "not listed" over a live listing relists at a
                 different price. Both orders are valid, both fillable, and a
                 buyer takes the cheaper one — so the seller loses the spread on
                 a piece they believed was unlisted. */
              <p className="token-note">
                Whether this is listed could not be read &mdash; the node would not serve
                event logs. Do not list it again until this loads; you could end up with
                two live listings at different prices.
              </p>
            ) : (
              <p className="token-note">
                Not listed for sale. Only its owner can set a price &mdash; but anyone can
                make an offer below.
              </p>
            )}

            <TxResult
              hash={fill.hash ?? trade.hash}
              confirming={busy && (fill.confirming || trade.confirming)}
              success={fill.isSuccess || trade.isSuccess}
              error={fill.error ?? trade.error}
              /* What happened, from the button that caused it — never from the
                 panel's state. See `lastAction`. */
              successLabel={
                lastAction === "approve"
                  ? "Approved — now set a price and list it"
                  : lastAction === "list"
                    ? "Listed"
                    : lastAction === "cancel"
                      ? "Listing cancelled"
                      : lastAction === "buy"
                        ? "Bought"
                        : "Done"
              }
            />
          </div>

          {collection === undefined ? null : (
            <>
              {/* What this token has actually done — the only thing on the page
                  that is not somebody's asking price. */}
              <Activity collection={collection} tokenId={tokenId} />

              <Offers
                collection={collection}
                tokenId={tokenId}
                isOwner={isOwner}
                onChange={afterAction}
              />
            </>
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
