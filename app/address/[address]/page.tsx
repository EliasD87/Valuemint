"use client";

import { use } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useHoldings } from "@/hooks/useHoldings";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { ShareLink } from "@/components/ShareLink";
import { deployment } from "@/config/contracts";
import { shortAddress } from "@/lib/format";
import "@/styles/collections.css";

/**
 * Everything one address holds on ValueChain.
 *
 * The same view `/portfolio` gives you of your own wallet, for anybody's -
 * which is the point. A marketplace where you can only see your own holdings
 * makes it impossible to check who you are trading with, or to follow a
 * collector whose taste you rate.
 *
 * `useHoldings` was already written to take an address rather than assume the
 * connected one, so this is a route and a search box rather than new machinery.
 * It asks each collection for a balance and then reads back exactly those ids,
 * so the answer is complete rather than a sample.
 */
export default function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: raw } = use(params);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const target = valid ? (raw as `0x${string}`) : undefined;

  const { address: viewer } = useAccount();
  const { tokens, isLoading, unlistable } = useHoldings(target);

  const isSelf = viewer !== undefined && target !== undefined && viewer.toLowerCase() === target.toLowerCase();

  if (!valid) {
    return (
      <section className="page section market-empty">
        <h2>That isn&rsquo;t a wallet address.</h2>
        <p className="muted">A ValueChain address is 0x followed by 40 hex characters.</p>
        <Link className="btn mt-sm" href="/collections">
          Browse collections
        </Link>
      </section>
    );
  }

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Wallet</p>
          <h2>{isSelf ? "Your collection" : shortAddress(raw, 6)}</h2>
        </div>
        <div className="wrap-row head-actions">
          <ShareLink title={`${shortAddress(raw, 6)} on ValueMint`} />
          <a
            className="head-link"
            href={`${deployment.explorer}/address/${raw}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            On the explorer &rarr;
          </a>
        </div>
      </div>

      <div className="strip-inner">
        <span className="strip-item">
          <b>{isLoading ? "…" : tokens.length}</b> held
        </span>
        <span className="strip-item mono dim">{shortAddress(raw, 6)}</span>
      </div>

      {/*
        Collections without the Enumerable extension report a balance but cannot
        say which ids. Naming them is the honest thing: silently omitting them
        would make this page under-report, which is worse than no page at all.
      */}
      {unlistable.length > 0 ? (
        <p className="portfolio-note">
          {unlistable.length} collection{unlistable.length === 1 ? "" : "s"} could not be read.
          They hold a balance for this address but do not publish a token list, so their pieces
          cannot be shown here.
        </p>
      ) : null}

      {isLoading && tokens.length === 0 ? (
        <div className="grid-tokens">
          {Array.from({ length: 8 }, (_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="market-empty">
          <h3>This wallet holds nothing on ValueChain.</h3>
          <p className="muted">
            Nothing minted from any collection this marketplace can see. It may still hold
            tokens from a collection that does not publish a list.
          </p>
        </div>
      ) : (
        <div className="grid-tokens">
          {tokens.map((t) => (
            <TokenCard
              key={`${t.collection}-${t.id}`}
              token={t}
              collection={t.collection}
              listing={t.listing}
              viewerAddress={viewer}
            />
          ))}
        </div>
      )}
    </section>
  );
}
