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
 * can already reach a chain this new. That reasoning does not survive contact
 * with a phone: an injected provider only exists inside a wallet's own in-app
 * browser, so anyone opening the site in Safari or Chrome on a handset saw a
 * Connect button that could not work. Every mobile visitor arriving from a
 * shared link was in exactly that position.
 *
 * WalletConnect is what fixes that — it is the protocol Rainbow, Trust,
 * MetaMask Mobile, Coinbase Wallet and the rest all speak, so one connector
 * covers the field.
 *
 * Coinbase's own SDK connector was tried and removed. It duplicates coverage
 * WalletConnect already gives, and it drags in `@coinbase/cdp-sdk` and through
 * it a version of axios carrying ten advisories including prototype pollution.
 * A second path to the same wallets is not worth that dependency in a bundle
 * that handles signing.
 *
 * WalletConnect is skipped rather than misconfigured when the id is absent, so
 * a local checkout with no `.env` still runs on the injected connector.
 */
const connectors = [
  injected({ shimDisconnect: true }),
  ...(wcProjectId === ""
    ? []
    : [
        walletConnect({
          projectId: wcProjectId,
          // The wallet shows these while asking to connect.
          metadata: {
            name: "ValueMint",
            description: "NFT marketplace on ValueChain",
            url: "https://www.valuemint.store",
            icons: ["https://www.valuemint.store/icon.png"],
          },
          /**
           * The bundled modal, with two costs that are worth stating plainly
           * rather than discovering later.
           *
           * It is heavy: WalletConnect is 328 KB gzipped, 40% of all client
           * JavaScript, and it is in the initial load because the wagmi config
           * is imported by the provider that wraps every page. Measured against
           * a production build, the home page went from roughly 290 KB of
           * JavaScript over the wire to 614 KB.
           *
           * And it is not silent: AppKit fetches its config from
           * api.web3modal.org and posts an event to pulse.walletconnect.org on
           * page load, before anyone has clicked Connect. The previous
           * injected-only setup genuinely had nothing phoning home.
           *
           * Both are the price of mobile wallets working at all, which is worth
           * paying — a marketplace nobody on a phone can transact with is worth
           * less than 328 KB. Setting `showQrModal: false` avoids both, but
           * then this app has to render the pairing URI and QR code itself, and
           * mishandling that breaks connection for everyone rather than making
           * it slower. That is a deliberate follow-up, not a launch change.
           */
          showQrModal: true,
        }),
      ]),
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
