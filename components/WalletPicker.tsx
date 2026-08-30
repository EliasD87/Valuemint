"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect, type Connector } from "wagmi";
import "./WalletPicker.css";

/**
 * Which wallet to connect with.
 *
 * Before this, Connect took the first injected provider it found and used it
 * without asking. Two things were wrong with that. Someone with an extension
 * installed could never choose anything else — not a second extension, not
 * their phone by QR. And "the first injected provider" is not a wallet anyone
 * chose: it is whichever one won the race to claim `window.ethereum`.
 *
 * wagmi already solves the discovery half through EIP-6963, where each wallet
 * announces itself with a name, an icon and a stable id. Those arrive as
 * separate connectors; all that was missing was somewhere to show them.
 */
export function WalletPicker({ onClose }: { onClose: () => void }) {
  const { connect, connectors, isPending, error } = useConnect();
  const panel = useRef<HTMLDivElement>(null);

  /**
   * Rendered into `document.body`, not where it is written.
   *
   * This component is returned from `<Wallet>`, which lives inside the header —
   * and the header carries `backdrop-filter`. Like `transform`, that makes an
   * element the containing block for any `position: fixed` descendant, so
   * `top: 50%` centred the dialog inside a 72px bar rather than the viewport
   * and put its title 34px above the top of the screen.
   *
   * A portal is the fix rather than moving the header's blur, which is load
   * bearing for the header's own look.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  /**
   * EIP-6963 connectors carry the wallet's real identity; the generic
   * `injected` one is a fallback for browsers that predate the standard.
   *
   * They overlap: with MetaMask installed, both "MetaMask" and "Injected"
   * appear and connect to the same wallet. Showing both is confusing, so the
   * generic entry is dropped whenever any named wallet was discovered.
   */
  const named = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const generic = connectors.find((c) => c.id === "injected");
  const walletConnect = connectors.find((c) => c.id === "walletConnect");

  const installed: Connector[] =
    named.length > 0
      ? named
      : generic !== undefined && typeof window !== "undefined" && "ethereum" in window
        ? [generic]
        : [];

  const pick = (connector: Connector) => {
    connect({ connector });
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="wp-scrim" onClick={onClose} aria-hidden="true" />
      <div className="wp" role="dialog" aria-modal="true" aria-label="Connect a wallet" ref={panel}>
        <div className="wp-head">
          <h2>Connect a wallet</h2>
          <button type="button" className="wp-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="wp-list">
          {installed.map((c) => (
            <button key={c.uid} type="button" className="wp-item" disabled={isPending} onClick={() => pick(c)}>
              {/* Wallets supply their own icon as a data URI through EIP-6963. */}
              {c.icon === undefined ? (
                <span className="wp-mark" aria-hidden="true">
                  {c.name.slice(0, 1)}
                </span>
              ) : (
                <img className="wp-mark" src={c.icon} alt="" width={28} height={28} />
              )}
              <span className="wp-name">{c.name}</span>
              <span className="wp-tag">Installed</span>
            </button>
          ))}

          {walletConnect === undefined ? null : (
            <button
              key={walletConnect.uid}
              type="button"
              className="wp-item"
              disabled={isPending}
              onClick={() => pick(walletConnect)}
            >
              <span className="wp-mark wp-mark-qr" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <path d="M14 14h3v3h-3zM19 19h2v2h-2z" />
                </svg>
              </span>
              <span className="wp-name">
                {installed.length === 0 ? "Connect a wallet" : "Another wallet"}
                <span className="wp-sub">Scan a QR code, or open a wallet on your phone</span>
              </span>
            </button>
          )}

          {installed.length === 0 && walletConnect === undefined ? (
            <p className="wp-empty">
              No wallet found in this browser.{" "}
              <a href="https://metamask.io/download/" target="_blank" rel="noreferrer noopener">
                Install one
              </a>{" "}
              to continue.
            </p>
          ) : null}
        </div>

        {error === null ? null : (
          <p className="wp-error">
            {/rejected|denied|User denied/i.test(error.message)
              ? "That request was cancelled in your wallet."
              : error.message.slice(0, 160)}
          </p>
        )}
      </div>
    </>,
    document.body,
  );
}
