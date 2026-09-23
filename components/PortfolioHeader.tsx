"use client";

import { useEffect, useState } from "react";
import { WalletMark } from "@/components/WalletMark";
import { Soso, SosoMark } from "@/components/Soso";
import { useSosoPrice } from "@/hooks/useSosoPrice";
import { useWsoso } from "@/hooks/useWsoso";
import { deployment } from "@/config/contracts";
import { formatCount, formatSoso, formatSosoFixed, shortAddress } from "@/lib/format";
import { formatUsd, sosoToUsd } from "@/lib/usd";
import type { FloorValue } from "@/lib/portfolioValue";

/**
 * The top of a portfolio: whose it is, what is in the wallet, and what it holds.
 *
 * The balance leads, and only the balance. It is the one figure here that is
 * a fact — SOSO the chain says this address holds. An "estimated value" built
 * from floors led for one draft and was taken down: on a marketplace this new,
 * a floor is often one listing, sometimes a test price, and a headline built
 * on it would state a guess in the biggest type on the page.
 *
 * The floor figure is still here, as the last of three small cells and named
 * for what it is — "At floor" — with the pieces it could not price counted
 * rather than guessed. Useful as a reference; never the answer.
 *
 * Dollars ride beside the balance, and vanish rather than read "$0.00" while
 * the price is unknown.
 */
export function PortfolioHeader({
  address,
  pieces,
  collections,
  listed,
  asking,
  balance,
  nfts,
}: {
  address: `0x${string}`;
  pieces: number;
  collections: number;
  listed: number;
  /** Total of the asking prices, in wei. */
  asking: bigint;
  /** Native SOSO held. `undefined` until the read lands. */
  balance?: bigint;
  /** Pieces at their floors. `undefined` while holdings or floors are still loading. */
  nfts?: FloorValue;
}) {
  const price = useSosoPrice();
  /* Offers are made in WSOSO, so a bidder's spending money is partly wrapped.
     Nothing is needed or approved here; this is only the balance. */
  const wsoso = useWsoso(0n).balance;

  const usd = balance === undefined || price === undefined ? undefined : sosoToUsd(balance, price);

  return (
    <section className="ph" aria-label="Portfolio">
      <div className="ph-id">
        <WalletMark address={address} size={44} />
        <div className="ph-who">
          <h2 className="ph-title">Portfolio</h2>
          <div className="ph-addr">
            <span className="ph-addr-text" title={address}>
              {shortAddress(address)}
            </span>
            <CopyButton text={address} />
            <a
              className="ph-icon"
              href={`${deployment.explorer}/address/${address}`}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="View this wallet on the block explorer"
              title="View on the explorer"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path
                  d="M6 3.5H4.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V10M9 3.5h3.5V7M12.5 3.5 7.5 8.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="ph-worth">
        <p className="ph-label">Balance</p>
        {balance === undefined ? (
          <span className="skeleton ph-total-wait" aria-label="Loading balance" role="status" />
        ) : (
          <p className="ph-total">
            <span className="ph-total-amount" title={`${formatSoso(balance, 18)} SOSO`}>
              {formatSosoFixed(balance)}
            </span>
            <span className="ph-total-unit">
              <SosoMark size={20} />
              SOSO
            </span>
            {usd === undefined ? null : (
              <span className="ph-total-usd" title="At CoinGecko's current SOSO price">
                {formatUsd(usd)}
              </span>
            )}
          </p>
        )}
        {/* Wrapped SOSO is spending money too, set aside for offers. Named on
            its own line rather than added in: it is a different token, and a
            bidder needs to see how much of it they have. */}
        {wsoso > 0n ? (
          <p className="ph-wrapped">
            + <Soso size={12} markAt="unit" unit="WSOSO">{formatSosoFixed(wsoso)}</Soso>
          </p>
        ) : null}
      </div>

      {/* A label and a figure each, nothing under them. The detail that used
          to sit on a third line — collections, the asking total, the pieces
          without a floor — is one hover away in the title instead. */}
      <dl className="ph-cells">
        <div
          className="ph-cell"
          title={`${formatCount(BigInt(collections))} ${collections === 1 ? "collection" : "collections"}`}
        >
          <dt>Pieces</dt>
          <dd className="ph-fig">{formatCount(BigInt(pieces))}</dd>
        </div>

        <div className="ph-cell" title={`${formatSosoFixed(asking)} SOSO asking`}>
          <dt>Listed</dt>
          <dd className="ph-fig">{formatCount(BigInt(listed))}</dd>
        </div>

        <div
          className="ph-cell"
          title={
            nfts !== undefined && nfts.unpriced > 0
              ? `Cheapest asks; ${nfts.unpriced} without a floor are not counted`
              : "Cheapest asks"
          }
        >
          <dt>At floor</dt>
          <dd className="ph-fig">
            {nfts === undefined ? (
              <span className="skeleton ph-fig-wait" />
            ) : (
              <Soso size={13} markAt="unit">
                {formatSosoFixed(nfts.total)}
              </Soso>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Copies the address, and says so for a moment. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      className={`ph-icon${copied ? " is-done" : ""}`}
      aria-label={copied ? "Address copied" : "Copy address"}
      title={copied ? "Copied" : "Copy address"}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {copied ? (
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M10.5 3.5V3.4A1.4 1.4 0 0 0 9.1 2H4.4A1.4 1.4 0 0 0 3 3.4v4.7a1.4 1.4 0 0 0 1.4 1.4h.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
}
