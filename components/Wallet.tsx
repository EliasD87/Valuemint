"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { valuechain } from "@/config/chain";
import { formatSoso, shortAddress } from "@/lib/format";
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
  const { connect, connectors, isPending } = useConnect();
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
  useEffect(() => setMounted(true), []);

  const injected = connectors.find((c) => c.id === "injected");
  /**
   * Registered only when there is no injected provider — see config/wagmi.ts.
   * Its presence in this list is therefore also the signal that this browser
   * has no wallet of its own.
   */
  const walletConnect = connectors.find((c) => c.id === "walletConnect");
  const hasWallet = mounted && typeof window !== "undefined" && "ethereum" in window;

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
     * No injected provider. Previously this was a dead end that offered a
     * MetaMask download — useless advice on a phone, where the visitor almost
     * certainly already has a wallet and simply is not browsing inside it.
     * WalletConnect is what actually connects them, by deep link on mobile or
     * a QR code on a desktop.
     */
    if (!hasWallet) {
      if (walletConnect !== undefined) {
        return (
          <button
            className="btn btn-solid"
            disabled={isPending}
            onClick={() => connect({ connector: walletConnect })}
          >
            {isPending ? "Opening…" : (
              <>
                Connect<span className="wide-only">&nbsp;wallet</span>
              </>
            )}
          </button>
        );
      }
      return (
        <a className="btn btn-solid" href="https://metamask.io/download/" target="_blank" rel="noreferrer noopener">
          Install<span className="wide-only"> MetaMask</span>
        </a>
      );
    }

    return (
      <button
        className="btn btn-solid"
        disabled={isPending || injected === undefined}
        onClick={() => injected !== undefined && connect({ connector: injected })}
      >
        {isPending ? (
          <>
            Checking<span className="wide-only">&nbsp;your wallet</span>…
          </>
        ) : (
          <>
            Connect<span className="wide-only">&nbsp;wallet</span>
          </>
        )}
      </button>
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
