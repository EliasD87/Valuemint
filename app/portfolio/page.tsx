"use client";

import { useAccount } from "wagmi";
import { PortfolioView } from "@/components/PortfolioView";
import { ConnectButton } from "@/components/ConnectButton";
import "@/styles/home.css";
import "@/styles/portfolio.css";

/**
 * Your own wallet. Everything below the connect step is `PortfolioView`, which
 * /address/… shares — see there.
 *
 * There is no "waiting for you" balance any more, and nothing to claim. The
 * previous marketplace escrowed a payout whose transfer failed, so this page
 * carried a pendingWithdrawals read and a Claim button. Seaport pays the
 * consideration directly inside the fill - if a payout cannot be delivered the
 * whole sale reverts, so money is never left holding. All three old
 * marketplace contracts were checked before removing this: each holds 0 SOSO.
 */
export default function Portfolio() {
  const { address, isConnected, status } = useAccount();

  /**
   * Restoring last visit's wallet takes a moment after the page loads (see
   * `ssr` in config/wagmi.ts). Asking somebody to connect a wallet that is
   * connecting is the wrong thing to show for that moment.
   */
  if (status === "reconnecting" || status === "connecting") {
    return (
      <section className="page section market-empty" aria-busy="true">
        <p className="eyebrow">Portfolio</p>
        <p className="muted">Reconnecting your wallet…</p>
      </section>
    );
  }

  if (!isConnected || address === undefined) {
    return (
      <section className="page section market-empty">
        <p className="eyebrow">Portfolio</p>
        <h2>Connect your wallet to see what you hold.</h2>
        <p className="muted">
          Holdings are read straight from every collection on the chain — nothing is stored on our
          side.
        </p>
        <ConnectButton>Connect wallet</ConnectButton>
      </section>
    );
  }

  return <PortfolioView address={address} viewer={address} own heading="Portfolio" />;
}
