"use client";

import { createConfig, fallback, http, webSocket } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { valuechain, BLOCK_TIME_MS, RPC_HTTP } from "@/config/chain";

/**
 * WalletConnect needs a project id. It is free, from cloud.reown.com, and it is
 * public by design — it identifies the dApp to the relay and grants nothing, so
 * `NEXT_PUBLIC_` is correct here in a way it is not for any other variable in
 * this project.
 *
 * Read at module scope so the value is inlined at build time; reading it inside
 * the connector would give `undefined` in the browser.
 */
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

/**
 * Connectors.
 *
 * This was injected-only, on the reasoning that MetaMask covers everyone who
 * can already reach a chain this new. That is true inside a wallet's own in-app
 * browser, where a provider is injected and the old setup worked fine. It is
 * not true of the place most people actually arrive: a link tapped in X,
 * Discord or Telegram opens that app's webview or Safari, where there is no
 * injected provider and no hint that the URL has to be pasted into a wallet
 * browser first. The Connect button simply did nothing.
 *
 * WalletConnect closes that, and is registered *only when there is no injected
 * provider*.
 *
 * That condition is the point. WalletConnect is 328 KB gzipped and its modal
 * contacts api.web3modal.org and pulse.walletconnect.org on load, before anyone
 * has clicked anything — so a wallet-browser user, who never needs it, should
 * not pay for it. They keep the injected path and nothing phones home.
 *
 * The bytes are still in the bundle either way: wagmi builds its config
 * synchronously at module scope, so avoiding the download needs a dynamic
 * import and a restructure. This avoids the runtime cost and the telemetry,
 * which are the parts that were objectionable.
 */
const hasInjectedProvider =
  typeof window !== "undefined" &&
  (window as { ethereum?: unknown }).ethereum !== undefined;

/**
 * During SSR there is no `window`, so WalletConnect is included — a superset.
 * The Wallet control does not read the connector list until after hydration,
 * so the server and client never disagree about what to render.
 */
const wantsWalletConnect = wcProjectId !== "" && !hasInjectedProvider;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(wantsWalletConnect
    ? [
        walletConnect({
          projectId: wcProjectId,
          // The wallet shows these while asking to connect.
          metadata: {
            name: "ValueMint",
            description: "NFT marketplace on ValueChain",
            url: "https://www.valuemint.store",
            icons: ["https://www.valuemint.store/icon.png"],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

/**
 * Transport.
 *
 * `fallback` rather than a single `http`, because every page on this site is
 * built from chain reads: one endpoint being down did not degrade the site, it
 * blanked it. viem moves to the next transport on failure and ranks them by
 * observed latency, so a slow primary also stops being everyone's problem.
 *
 * The WebSocket is first. It is the same node, but an open socket avoids a
 * connection setup per batch, and it is the transport the event subscriptions
 * need — until now the URL sat in `config/chain.ts` and nothing used it.
 */
export const wagmiConfig = createConfig({
  chains: [valuechain],
  connectors,
  transports: {
    [valuechain.id]: fallback(
      [
        webSocket(valuechain.rpcUrls.default.webSocket?.[0], { retryCount: 2 }),
        ...RPC_HTTP.map((url) => http(url, { batch: true, retryCount: 2 })),
      ],
      { rank: { interval: 60_000 } },
    ),
  },
  pollingInterval: BLOCK_TIME_MS,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
