"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { valuechain } from "@/config/chain";
import { formatSoso, shortAddress } from "@/lib/format";
import { WalletPicker } from "./WalletPicker";
import "./Wallet.css";

/**
 * Wallet control.
 *
 * Three states matter and each needs a different call to action: no wallet
 * installed at all, connected to the wrong chain, and connected properly. Lumping
 * them into one "Connect" button is how people end up staring at a dead app,
 * so the wrong-network case gets its own loud treatment.
 */
export function Wallet() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  // `connect` and the connector list moved into WalletPicker; only the pending
  // flag is still read here, to disable the button while a connection is open.
  const { isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { refetchInterval: 15_000 } });
  const [open, setOpen] = useState(false);

  /**
   * Nothing here may depend on `window` until after hydration.
   *
   * Whether a provider is injected is only knowable in the browser, and the
   * server has to render something. Deciding on the server and again on the
   * client produced two different buttons for the same markup — React patches
   * it, but the flash is real and the warning was deserved.
   */
  const [mounted, setMounted] = useState(false);
  const [picking, setPicking] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isConnected) {
    // Stable placeholder until the browser has been inspected.
    if (!mounted) {
      return (
        <button className="btn btn-solid" disabled>
          Connect<span className="wide-only">&nbsp;wallet</span>
        </button>
      );
    }

    /**
     * One button, and it always asks.
     *
     * This used to branch: an injected provider was connected to immediately,
     * and only its absence produced anything to choose from. So whoever had an
     * extension installed got that extension and no say — not a second
     * extension, not their phone. And the connector it reached for was the
     * generic `injected` one, which is whichever wallet won the race to claim
     * `window.ethereum` rather than one anybody picked.
     */
    return (
      <>
        <button className="btn btn-solid" disabled={isPending} onClick={() => setPicking(true)}>
          {isPending ? (
            <>
              Connecting<span className="wide-only">&nbsp;your wallet</span>…
            </>
          ) : (
            <>
              Connect<span className="wide-only">&nbsp;wallet</span>
            </>
          )}
        </button>
        {picking ? <WalletPicker onClose={() => setPicking(false)} /> : null}
      </>
    );
  }

  if (chainId !== valuechain.id) {
    return (
      <button
        className="btn wallet-wrong"
        disabled={isSwitching}
        onClick={() => switchChain({ chainId: valuechain.id })}
      >
        {isSwitching ? "Switching…" : (
          <>
            Wrong network<span className="wide-only">&nbsp;— switch</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="wallet">
      <button className="wallet-trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="wallet-dot" aria-hidden="true" />
        <span className="mono wallet-addr">{shortAddress(address)}</span>
        <span className="mono wallet-bal">{formatSoso(balance?.value)} SOSO</span>
      </button>

      {open ? (
        <>
          <button className="wallet-scrim" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="wallet-menu">
            <div className="wallet-menu-head">
              <span className="label">Connected</span>
              <span className="mono wallet-full">{address}</span>
            </div>
            <div className="wallet-menu-actions">
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (address !== undefined) void navigator.clipboard.writeText(address);
                  setOpen(false);
                }}
              >
                Copy address
              </button>
              <a
                className="btn btn-sm"
                href={`${valuechain.blockExplorers.default.url}/address/${address}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                View on explorer
              </a>
              <button
                className="btn btn-sm"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
