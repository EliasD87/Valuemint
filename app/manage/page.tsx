"use client";

import Link from "next/link";
import { useConnect } from "wagmi";
import { useOwnedCollections } from "@/hooks/useAllCollections";
import { formatCount, formatSoso } from "@/lib/format";
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
  const { connect, connectors, isPending } = useConnect();

  if (!connected) {
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
                <span className="coll-avatar">{(c.symbol || c.name).slice(0, 2).toUpperCase()}</span>
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
