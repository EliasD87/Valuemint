"use client";

import { useState } from "react";
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

  const injected = connectors.find((c) => c.id === "injected");
  const hasWallet = typeof window !== "undefined" && "ethereum" in window;

  if (!isConnected) {
    if (!hasWallet) {
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
