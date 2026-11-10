"use client";

import { use } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { PortfolioView } from "@/components/PortfolioView";
import { ShareLink } from "@/components/ShareLink";
import { deployment } from "@/config/contracts";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";
import "@/styles/home.css";
import "@/styles/portfolio.css";

/**
 * Everything one address holds on ValueChain — the search result.
 *
 * The same view `/portfolio` gives you of your own wallet, for anybody's,
 * which is the point: a marketplace where you can only see your own holdings
 * makes it impossible to check who you are trading with, or to follow a
 * collector whose taste you rate.
 *
 * It IS the portfolio's view (`PortfolioView`), read-only. `own` is true only
 * when the connected wallet is this address, and it turns off the things only
 * a holder can act on or should be asked: bulk listing, accepting offers,
 * withdrawing bids, "where is my SOSO". Every figure is read for the address
 * in the URL, never for the viewer.
 */
export default function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const t = useT();
  const { address: raw } = use(params);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const target = valid ? (raw as `0x${string}`) : undefined;

  const { address: viewer } = useAccount();

  if (target === undefined) {
    return (
      <section className="page section market-empty">
        <h2>{t("That isn’t a wallet address.")}</h2>
        <p className="muted">{t("A ValueChain address is 0x followed by 40 hex characters.")}</p>
        <Link className="btn mt-sm" href="/collections">
          {t("Browse collections")}
        </Link>
      </section>
    );
  }

  const own = viewer !== undefined && viewer.toLowerCase() === target.toLowerCase();

  return (
    <PortfolioView
      address={target}
      viewer={viewer}
      own={own}
      heading={t("Wallet {address}", { address: shortAddress(target, 6) })}
      extra={
        <>
          {own ? (
            <Link className="chip chip-up ph-you" href="/portfolio">
              {t("This is you · open your portfolio")}
            </Link>
          ) : null}
          <ShareLink title={t("{address} on ValueMint", { address: shortAddress(target, 6) })} />
          {/* Named, not just the icon beside the address: the explorer is
              where someone goes for the wallet's raw transactions, and
              arriving here from a click they may have wanted that. */}
          <a
            className="btn btn-sm ph-scan"
            href={`${deployment.explorer}/address/${target}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("View on Mainscan")} &#8599;
          </a>
        </>
      }
    />
  );
}
