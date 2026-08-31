"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnect } from "wagmi";
import { useOwnedCollections } from "@/hooks/useAllCollections";
import { formatCount, formatSoso } from "@/lib/format";
import { Art } from "@/components/Art";
import { useCollectionArt } from "@/hooks/useCollectionArt";
import "@/styles/manage.css";
import "@/styles/home.css";

/**
 * The creator's index: every collection this wallet owns.
 *
 * Ownership is read from each contract's `owner()`, not from a list we keep, so a
 * collection transferred to you elsewhere shows up here without us being told.
 */
export default function Manage() {
  const { owned, isLoading, connected } = useOwnedCollections();

  /**
   * The same covers /collections uses, so a creator sees their own work here
   * rather than two letters of its ticker. `.coll-avatar` had no CSS at all -
   * the initials were bare text sitting next to the name.
   */
  const { artFor } = useCollectionArt();
  
  const { connect, connectors, isPending } = useConnect();

  /**
   * Wallet state does not exist during server rendering.
   *
   * `connected` is always false on the server, so a visitor with a wallet got
   * the connect prompt in the HTML and their collections on the client - two
   * different trees, and React discarded the server's and rebuilt. That is the
   * hydration mismatch this page was throwing.
   *
   * Holding the server's shape until after mount costs one frame and makes the
   * two agree. Same pattern as ThemeToggle, for the same reason.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !connected) {
    return (
      <section className="page section market-empty">
        <p className="eyebrow">Manage</p>
        <h2>Connect the wallet that owns your collections.</h2>
        <p className="muted">
          Ownership is read from each contract, so whatever you control shows up — including
          collections deployed before this site existed.
        </p>
        <button
          className="btn btn-primary btn-lg"
          disabled={isPending}
          onClick={() => {
            const injected = connectors.find((c) => c.id === "injected");
            if (injected !== undefined) connect({ connector: injected });
          }}
        >
          {isPending ? "Check your wallet…" : "Connect wallet"}
        </button>
      </section>
    );
  }

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Manage</p>
          <h2>Your collections</h2>
        </div>
        <Link className="btn btn-primary" href="/create">
          Create another
        </Link>
      </div>

      {isLoading && owned.length === 0 ? (
        <div className="manage-list">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="manage-row card">
              <div className="skeleton" style={{ height: "2rem" }} />
              <div className="skeleton" style={{ height: "2.5rem" }} />
            </div>
          ))}
        </div>
      ) : owned.length === 0 ? (
        <div className="market-empty">
          <h3>You don&rsquo;t own any collections yet.</h3>
          <p className="muted">
            Deploying one costs gas and nothing else. You own the contract outright and manage it
            from here.
          </p>
          <Link className="btn btn-primary mt-sm" href="/create">
            Create a collection
          </Link>
        </div>
      ) : (
        <div className="manage-list">
          {owned.map((c) => (
            <Link key={c.address} href={`/manage/${c.address}`} className="manage-row card card-hover">
              <div className="manage-row-head">
                {(() => {
                  /**
                   * Initials stay as the fallback rather than a grey box: a collection
                   * with nothing minted, or one whose metadata host is down, still has a
                   * name, and two letters read better than an empty square.
                   */
                  const cover = artFor(c.address)[0];
                  return cover === undefined ? (
                    <span className="manage-thumb manage-thumb-empty">
                      {(c.symbol || c.name).slice(0, 2).toUpperCase()}
                    </span>
                  ) : (
                    <span className="manage-thumb">
                      <Art src={cover} alt="" sizes="56px" />
                    </span>
                  );
                })()}
                <div className="min-0">
                  <b>{c.name}</b>
                  <div className="mono dim manage-row-addr">
                    {c.symbol}
                  </div>
                </div>
                <span
                  className={`chip ${c.publicMintEnabled === true ? "chip-up" : ""}`}
                >
                  {c.publicMintEnabled === true ? "Minting" : "Closed"}
                </span>
              </div>

              <dl className="manage-row-stats">
                <div>
                  <dt>Minted</dt>
                  <dd className="mono">
                    {formatCount(c.totalSupply)}
                    {c.maxSupply !== undefined && c.maxSupply > 0n
                      ? ` / ${formatCount(c.maxSupply)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd className="mono">{formatSoso(c.mintPrice)} SOSO</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd className="mono">{formatCount(c.publicMintRemaining)}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
