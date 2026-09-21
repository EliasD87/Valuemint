"use client";

import { useState, type ReactNode } from "react";
import { useConnect } from "wagmi";
import { WalletPicker } from "./WalletPicker";

/**
 * Connect, from anywhere that is not the header.
 *
 * ## The bug this replaces
 *
 * Six pages each wrote their own version of it, and every one of them did
 * this:
 *
 *     const injected = connectors.find((c) => c.id === "injected");
 *     if (injected !== undefined) connect({ connector: injected });
 *
 * Which is two silent failures wearing one coat.
 *
 * The generic `injected` connector is `window.ethereum` and nothing else. A
 * wallet that announces itself over EIP-6963 — which is how wallets are
 * expected to do it now, and how every wallet wagmi lists in the picker
 * arrives — does not have to claim that global, and several no longer do, or
 * claim it after the page has already asked. When it is not claimed the
 * connector is still in the list, so the `find` succeeds, `connect` is called
 * on a connector with no provider behind it, and it fails.
 *
 * And it fails *quietly*, because none of the six read `error` off
 * `useConnect`. The button went to "Check your wallet…", no wallet opened, and
 * it settled back. Nothing on screen ever said why. Reported against /manage
 * and /portfolio; /approvals, /create, /safe and the mint panel were the same
 * code.
 *
 * `WalletPicker` had none of this, which is why the header's button worked:
 * it lists the EIP-6963 connectors by name, falls back to the generic one only
 * when `window.ethereum` genuinely exists, offers WalletConnect when nothing
 * is installed at all, and shows the error when a connection is refused.
 *
 * So there is one connect path now, and it is that one. This component exists
 * so that using it is easier than hand-rolling the broken version again.
 */
export function ConnectButton({
  children,
  className = "btn btn-primary btn-lg",
}: {
  /** The label. "Connect wallet", "Connect wallet to mint", and so on. */
  children: ReactNode;
  className?: string;
}) {
  /**
   * Only the pending flag. `connect` and the connector list belong to the
   * picker — keeping them out of here is what stops this growing its own
   * opinion about which wallet to use.
   */
  const { isPending } = useConnect();
  const [picking, setPicking] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={isPending}
        onClick={() => setPicking(true)}
      >
        {isPending ? "Check your wallet…" : children}
      </button>
      {picking ? <WalletPicker onClose={() => setPicking(false)} /> : null}
    </>
  );
}
