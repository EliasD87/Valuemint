"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { SWITCH_STALLED, useSwitchToChain } from "@/hooks/useChainWrite";
import { valuechain } from "@/config/chain";
import { formatSoso, tinyAddress } from "@/lib/format";

/**
 * The account's glyph, with the live dot badged onto it.
 *
 * One component for the pill and the menu, so the two cannot drift into
 * different drawings of the same idea — the menu is meant to read as that pill
 * opened, not as a second component that happens to sit under it.
 *
 * Inline rather than an icon font: one glyph, no extra request. The dot is a
 * real element rather than part of the path so it can take `--up` and the
 * surface-coloured ring that punches it out of the wallet behind it.
 */
function WalletGlyph({ size }: { size: number }) {
  return (
    <span className="wallet-mark" style={{ ["--glyph" as string]: `${size}px` }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 16 16">
        <path
          d="M2.4 4.6h9.9a1.3 1.3 0 0 1 1.3 1.3v5.6a1.3 1.3 0 0 1-1.3 1.3H2.4a1.3 1.3 0 0 1-1.3-1.3V4.6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M1.1 5.4V4a1.3 1.3 0 0 1 1.3-1.3h7.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10.9" cy="8.7" r="1.05" fill="currentColor" />
      </svg>
      <span className="wallet-dot" />
    </span>
  );
}
import { WalletPicker } from "./WalletPicker";
import { WrappedBalance } from "@/components/WrappedBalance";
import { SosoCallout, WhereIsMySoso } from "@/components/SosoHelp";
import "./Wallet.css";
import { Soso } from "@/components/Soso";

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
  // The wallet's real network, from the connection. `useChainId()` only reports
  // chains in the config, so a wallet on Ethereum read as ValueChain (2026-09-25).
  const { chainId, connector } = useAccount();
  // `connect` and the connector list moved into WalletPicker; only the pending
  // flag is still read here, to disable the button while a connection is open.
  const { isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchTo, switching: isSwitching } = useSwitchToChain();
  const [switchStalled, setSwitchStalled] = useState(false);
  const { data: balance } = useBalance({ address, query: { refetchInterval: 15_000 } });
  const [open, setOpen] = useState(false);

  /** Reset on close, so the menu never opens already saying "Copied". */
  const [copied, setCopied] = useState(false);

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

  /**
   * The placeholder gates EVERY branch, not just the disconnected one.
   *
   * It used to sit inside `if (!isConnected)`, which left the connected path
   * unguarded — and that is the path that breaks. wagmi restores a previous
   * connection from storage during the first client render, so the server
   * emitted this button while the browser immediately rendered `<div
   * className="wallet">` in its place. React cannot patch a mismatch that
   * changes the element, so it threw away the server's HTML and re-rendered the
   * whole tree on the client.
   *
   * That re-render is what made the root layout's inline `<script>` warn, and
   * why the warning appeared at odd moments — an offer arriving would render,
   * then the recovery would blow it away a frame later. The script was never
   * the problem; this was.
   */
  if (!mounted) {
    return (
      <button className="btn btn-solid" disabled>
        Connect<span className="wide-only">&nbsp;wallet</span>
      </button>
    );
  }

  if (!isConnected) {
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
    /**
     * Switch, and a way out. The switch goes to the wallet this account is
     * connected through and gives up after 20s (see `useSwitchToChain`); and
     * Disconnect stays on screen, because a person whose site connection
     * belongs to the wrong wallet needs to reconnect with the right one — this
     * state used to replace the account menu entirely, leaving no way to.
     */
    return (
      <span className="wallet-wrong-group">
        <button
          className="btn wallet-wrong"
          disabled={isSwitching}
          title={switchStalled ? SWITCH_STALLED : undefined}
          onClick={() => {
            setSwitchStalled(false);
            switchTo(valuechain.id).catch(() => setSwitchStalled(true));
          }}
        >
          {isSwitching ? (
            "Check your wallet…"
          ) : switchStalled ? (
            <>
              Switch in your wallet<span className="wide-only">&nbsp;— retry</span>
            </>
          ) : (
            <>
              Wrong network<span className="wide-only">&nbsp;— switch{connector?.name ? ` in ${connector.name}` : ""}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-sm wallet-wrong-out"
          /* Which wallet this is, because it is not always the one people think:
             an earlier connection can come back as the active one. */
          title={connector?.name ? `Connected with ${connector.name}` : undefined}
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </span>
    );
  }

  return (
    <div className="wallet">
      <button
        className="wallet-trigger"
        onClick={() => {
          setCopied(false);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        {/*
          One row: who you are, then what you hold.

          The mark carries the live dot as a badge rather than standing beside
          it as a third loose item — the dot qualifies the account, so it
          belongs on the account's own glyph.

          `unit=""` on the balance. The SOSO mark is right there saying it, and
          the word again inside a header pill costs 34px to repeat a symbol.
          Safe here specifically because this is `useBalance` — the chain's own
          native balance — and not an order's currency, which is the case
          `currencyLabel` exists for and must never be hardcoded.
        */}
        <WalletGlyph size={15} />

        <span className="mono wallet-addr">{tinyAddress(address)}</span>

        <span className="wallet-rule" aria-hidden="true" />

        <span className="mono wallet-bal">
          <Soso size={13} unit="">
            {formatSoso(balance?.value)}
          </Soso>
        </span>
      </button>

      {/* Drops from this button by itself while the wallet is empty. Not while
          the menu is open: the menu carries the same question in its own
          balance row, and two of it stacked would be one too many. */}
      {open ? null : <SosoCallout balance={balance?.value} />}

      {open ? (
        <>
          <button
            className="wallet-scrim"
            aria-label="Close"
            onClick={() => {
              setCopied(false);
              setOpen(false);
            }}
          />
          <div className="wallet-menu">
            {/*
              The address IS the copy button.

              It was a wrapped full address across two lines, followed by a
              separate "Copy address" row — the address shown in a form nobody
              reads and an action to do the only thing anyone wants with it.
              One row now: the short form, click to copy, and it says so.
            */}
            <div className="wallet-menu-head">
              <span className="label">Connected</span>

              {/* The same glyph the pill carries, so the menu reads as that
                  pill opened rather than as a different component. */}
              <button
                className="wallet-copy"
                title={address}
                onClick={() => {
                  if (address === undefined) return;
                  void navigator.clipboard.writeText(address);
                  setCopied(true);
                }}
              >
                <WalletGlyph size={17} />
                <span className="mono wallet-copy-addr">{tinyAddress(address)}</span>
                <span className="wallet-copy-hint">{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            {/* A labelled row, not a loose figure. The balance is the one
                number in here, and giving it a name on the left and the ink on
                the right is what stops it reading as a caption to the address
                above it. */}
            <div className="wallet-menu-bal">
              {/*
                Which chain's SOSO, said outright.

                SOSO exists on more than one chain and a bare figure in a
                wallet menu invites the reader to assume it is whichever one
                they were last looking at. This is `useBalance` on the
                configured chain and nothing else, so the menu can say so
                rather than leave it to be inferred.
              */}
              <span className="wallet-menu-bal-label">
                Balance
                <small>on {valuechain.name}</small>
              </span>
              <span className="mono wallet-menu-bal-value">
                <Soso size={13}>{formatSoso(balance?.value)}</Soso>
              </span>
            </div>

            {/* Nothing unless the balance is empty; then, the way to fill it.
                Its dialog portals to the body, clear of this menu. */}
            <WhereIsMySoso balance={balance?.value} />

            {/*
              Wrapped SOSO, and the way back out of it — but only for somebody
              who has any. Bidding is the only thing that wraps, so most people
              never see this row at all.

              A child component rather than markup here, because it reads the
              order book to find what is already promised to standing bids, and
              this pill is in the header of every page. Inside the menu it
              mounts when the menu opens and not before.
            */}
            <WrappedBalance />

            <div className="wallet-menu-actions">
              {/*
                Approvals is no longer listed here, by request.

                The page itself stays at /approvals and still works — it is
                reached by typing the address or from a link elsewhere, not from
                this menu. It was three items competing for a two-item menu, and
                revoking an approval is a rare, deliberate act rather than
                something to be offered every time somebody checks their
                balance. Put the link back here if that judgement changes; the
                route never went anywhere.
              */}
              <a
                className="btn btn-sm"
                href={`${valuechain.blockExplorers.default.url}/address/${address}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                View on explorer
              </a>
              <button
                className="btn btn-sm wallet-disconnect"
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
