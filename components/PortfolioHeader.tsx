"use client";

import { useEffect, useState, type ReactNode } from "react";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { WalletMark } from "@/components/WalletMark";
import { Soso, SosoMark } from "@/components/Soso";
import { WhereIsMySoso } from "@/components/SosoHelp";
import { UnwrapDialog } from "@/components/UnwrapDialog";
import { useSosoPrice } from "@/hooks/useSosoPrice";
import { deployment } from "@/config/contracts";
import { formatCount, formatSoso, formatSosoFixed, shortAddress } from "@/lib/format";
import { currencyLabel } from "@/lib/seaport";
import { formatUsd, sosoToUsd } from "@/lib/usd";
import type { FloorValue } from "@/lib/portfolioValue";

/** The fourth figure: offers waiting on the holder, or bids a wallet has out. */
export interface HeaderOffers {
  label: string;
  /** `undefined` while it is still being checked. */
  count?: number;
  /** The best of them, per piece. */
  best?: { price: bigint; currency: `0x${string}` };
  /** Opens wherever they are listed in full. */
  onOpen?: () => void;
}

/**
 * The top of a portfolio: whose it is, then four figures in one band.
 *
 * The balance leads, and only the balance. It is the one figure here that is
 * a fact — SOSO the chain says this address holds. An "estimated value" built
 * from floors led for one draft and was taken down: on a marketplace this new,
 * a floor is often one listing, sometimes a test price, and a headline built
 * on it would state a guess in the biggest type on the page. So the band is
 * one wide cell for the balance and three narrower ones after it, and the
 * floor figure is named for what it is — "At floor" — with the pieces it could
 * not price counted rather than guessed.
 *
 * The fourth cell is the offers (2026-10-24). The inbox that lists them moved
 * behind a tab, and "somebody's money is waiting on you" is not a thing to
 * hide behind a tab — so the count sits here, in a slot that is there from the
 * first paint, checking, and then says how many and the best of them.
 *
 * Dollars ride under the balance, and vanish rather than read "$0.00" while
 * the price is unknown.
 *
 * **Anybody's wallet, not only yours.** `/address/…` draws the same header for
 * a wallet somebody searched for. Everything shown is read for `address`, never
 * for whoever is connected — the WSOSO line used to come from `useWsoso`, which
 * reads the CONNECTED account, and would have printed the visitor's own wrapped
 * balance under a stranger's name. `own` only turns off what makes sense solely
 * for the wallet's holder: unwrapping, and the "where is my SOSO" prompt.
 */
export function PortfolioHeader({
  address,
  pieces,
  collections,
  listed,
  asking,
  balance,
  nfts,
  offers,
  own = true,
  heading = "Portfolio",
  extra,
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
  offers?: HeaderOffers;
  /** The viewer holds this wallet. False on somebody else's /address page. */
  own?: boolean;
  /** The page's heading, for the outline — the address is what shows. */
  heading?: string;
  /** Beside the address: a "this is you" badge, a share control. */
  extra?: ReactNode;
}) {
  const price = useSosoPrice();
  /* Offers are made in WSOSO, so a bidder's spending money is partly wrapped.
     Read for THIS address — see the note above. */
  const { data: wsosoRaw } = useReadContract({
    address: deployment.wsoso,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
    query: { refetchInterval: 15_000 },
  });
  const wsoso = wsosoRaw ?? 0n;
  const [unwrapping, setUnwrapping] = useState(false);

  /**
   * Dollars for everything spendable: SOSO and WSOSO together (2026-10-09).
   * WSOSO is SOSO one for one, so leaving it out understated the wallet by
   * exactly what its owner had put behind offers. Held back until both reads
   * are in, so the figure does not land once and then jump.
   */
  const usd =
    balance === undefined || wsosoRaw === undefined || price === undefined
      ? undefined
      : sosoToUsd(balance + wsoso, price);

  return (
    <section className="ph" aria-label={heading}>
      <div className="ph-id">
        <WalletMark address={address} size={56} />
        <div className="ph-who">
          <h2 className="ph-title">{heading}</h2>
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
          {/* Small print under the address: how much there is, in words. Not
              said as "0 pieces" while the count is still arriving. */}
          {pieces > 0 ? (
            <p className="ph-sub">
              {formatCount(BigInt(pieces))} {pieces === 1 ? "piece" : "pieces"} across{" "}
              {formatCount(BigInt(collections))} {collections === 1 ? "collection" : "collections"}
            </p>
          ) : null}
        </div>
        {extra === undefined ? null : <div className="ph-extra">{extra}</div>}
      </div>

      <dl className="ph-stats">
        <div className="ph-stat ph-stat-lead">
          <dt>Balance</dt>
          <dd>
            {balance === undefined ? (
              <span className="skeleton ph-total-wait" aria-label="Loading balance" role="status" />
            ) : (
              <p className="ph-total">
                <span className="ph-total-amount" title={`${formatSoso(balance, 18)} SOSO`}>
                  {formatSosoFixed(balance)}
                </span>
                <span className="ph-total-unit">
                  <SosoMark size={18} />
                  SOSO
                </span>
                {usd === undefined ? null : (
                  <span
                    className="ph-total-usd"
                    title={
                      wsoso > 0n
                        ? `${formatSosoFixed(balance)} SOSO + ${formatSosoFixed(wsoso)} WSOSO, at CoinGecko's current SOSO price`
                        : "At CoinGecko's current SOSO price"
                    }
                  >
                    {formatUsd(usd)}
                  </span>
                )}
              </p>
            )}
            {/* Wrapped SOSO is spending money too. Named on its own line rather
                than added in: it is a different token. And said plainly what
                it is, because a seller who accepts an offer is PAID in it — the
                SOSO they expected never arrives as SOSO, and "+ 4 WSOSO" alone
                did not tell them that was their sale. */}
            {wsoso > 0n ? (
              <div className="ph-wrapped-block">
                <p className="ph-wrapped">
                  <span className="ph-wrapped-amount" title={`${formatSoso(wsoso, 18)} WSOSO`}>
                    + {formatSosoFixed(wsoso)}
                  </span>
                  <span className="ph-wrapped-unit">WSOSO</span>
                  {own ? (
                    <button type="button" className="ph-link" onClick={() => setUnwrapping(true)}>
                      Unwrap to SOSO
                    </button>
                  ) : null}
                </p>
                <p className="ph-wrapped-note">
                  Wrapped SOSO, worth exactly 1 SOSO each. Offers are made in it, and an offer you
                  accept pays you in it.
                </p>
              </div>
            ) : null}
            {unwrapping ? <UnwrapDialog onClose={() => setUnwrapping(false)} /> : null}
            {/* Only while the balance reads 0.00: the question an empty wallet
                raises, answered where it is raised — and only to its holder. */}
            {own ? <WhereIsMySoso balance={balance} /> : null}
          </dd>
        </div>

        <div className="ph-stat">
          <dt title="Each piece at the cheapest ask for its tier, or its collection's where it has no tier">
            At floor
          </dt>
          <dd className="ph-fig">
            {nfts === undefined ? (
              <span className="skeleton ph-fig-wait" />
            ) : (
              <Soso size={14}>{formatSosoFixed(nfts.total)}</Soso>
            )}
          </dd>
          <dd className="ph-note">
            {nfts === undefined
              ? " "
              : nfts.unpriced > 0
                ? `${formatCount(BigInt(nfts.unpriced))} without a floor, not counted`
                : "Cheapest asks, by tier"}
          </dd>
        </div>

        <div className="ph-stat">
          <dt>Listed</dt>
          <dd className="ph-fig">
            {formatCount(BigInt(listed))}
            {pieces > 0 ? <span className="ph-fig-of"> of {formatCount(BigInt(pieces))}</span> : null}
          </dd>
          <dd className="ph-note">
            {listed > 0 ? (
              <>
                <Soso size={11}>{formatSosoFixed(asking)}</Soso> asking
              </>
            ) : (
              "Nothing for sale"
            )}
          </dd>
        </div>

        {offers === undefined ? null : (
          <div className={`ph-stat${offers.count !== undefined && offers.count > 0 ? " is-live" : ""}`}>
            <dt>{offers.label}</dt>
            <dd className="ph-fig">
              {offers.count === undefined ? (
                <span className="skeleton ph-fig-wait" aria-label="Checking" role="status" />
              ) : (
                formatCount(BigInt(offers.count))
              )}
            </dd>
            <dd className="ph-note">
              {offers.count === undefined ? (
                "Checking…"
              ) : offers.count === 0 ? (
                "None right now"
              ) : (
                <>
                  {offers.best === undefined ? null : (
                    <>
                      Best{" "}
                      <Soso size={11} unit={currencyLabel(offers.best.currency)}>
                        {formatSosoFixed(offers.best.price)}
                      </Soso>
                    </>
                  )}
                  {offers.onOpen === undefined ? null : (
                    <button type="button" className="ph-link" onClick={offers.onOpen}>
                      Review
                    </button>
                  )}
                </>
              )}
            </dd>
          </div>
        )}
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
