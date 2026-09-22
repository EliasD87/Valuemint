"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWsoso } from "@/hooks/useWsoso";
import { useOwnOfferExposure } from "@/hooks/useSeaportOrders";
import { deployment } from "@/config/contracts";
import { formatSoso } from "@/lib/format";
import { Soso } from "@/components/Soso";
import { UnwrapDialog } from "@/components/UnwrapDialog";

/**
 * Wrapped SOSO in the wallet menu, and the door to getting it back.
 *
 * Bids are denominated in WSOSO and that is forced rather than chosen: an offer
 * has to stand over time without the marketplace holding anyone's money, so the
 * funds stay in the bidder's wallet and move on a pull, and native currency
 * cannot be pulled. So anybody who has ever made an offer has wrapped something
 * — and until now the balance appeared nowhere and nothing on this site offered
 * to undo it. `withdraw` sat in the ABI from the beginning and no code called
 * it.
 *
 * The menu shows the figure and nothing else. The arithmetic and the amount
 * field live in a dialog, because this strip is narrow and closes on any click
 * outside itself — a field in here is a field people lose halfway through.
 *
 * ---
 *
 * **Its own component so it mounts with the menu, not with the header.**
 * `useOwnOfferExposure` reads the whole order book and the wallet pill is on
 * every page; rendered inline that read would sit behind every page load. Here
 * it costs nothing until somebody opens the menu, which is the only moment any
 * of it is being looked at.
 */
export function WrappedBalance() {
  const { address } = useAccount();

  /** Nothing is being bought here, so nothing is needed and nothing is approved. */
  const wsoso = useWsoso(0n);

  /**
   * What is already promised to standing bids.
   *
   * Read here as well as in the dialog so the menu can say plainly why the
   * button is missing, rather than opening a dialog that turns out to have
   * nothing to offer.
   */
  const committed = useOwnOfferExposure(address, deployment.wsoso as `0x${string}`);

  const [unwrapping, setUnwrapping] = useState(false);

  const held = wsoso.balance;
  if (held === 0n) return null;

  const free = held > committed ? held - committed : 0n;

  return (
    <div className="wallet-wsoso">
      <div className="wallet-menu-bal">
        <span className="wallet-menu-bal-label">
          Wrapped
          <small>for offers</small>
        </span>
        <span className="mono wallet-menu-bal-value">
          <Soso size={13}>{formatSoso(held)}</Soso>
        </span>
      </div>

      {free > 0n ? (
        <button
          type="button"
          className="btn btn-sm wallet-wsoso-btn"
          onClick={() => setUnwrapping(true)}
        >
          Unwrap to SOSO
        </button>
      ) : (
        /*
         * Every last bit of it is behind a live bid, so there is nothing to
         * offer and a button would only open a dialog saying zero. Say it here
         * instead, with the reason — the balance looks spendable and is not.
         */
        <p className="wallet-wsoso-note">
          All of it is behind offers you have standing. Withdraw an offer to free it.
        </p>
      )}

      {unwrapping ? <UnwrapDialog onClose={() => setUnwrapping(false)} /> : null}
    </div>
  );
}
