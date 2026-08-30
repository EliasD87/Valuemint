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
 * This started injected-only, which worked inside a wallet's own in-app browser
 * and did nothing at all in Safari or Chrome on a phone — where a link tapped
 * in X or Discord actually lands.
 *
 * WalletConnect was then added *conditionally*, registered only when no
 * injected provider was present, to spare extension users its weight and its
 * telemetry. That condition is now gone, deliberately: you cannot offer a
 * choice you did not register. With it in place, someone who had MetaMask
 * installed but wanted to use their phone wallet had no way to say so, because
 * the connector that would have done it was never created.
 *
 * The cost comes back — 328 KB gzipped, and AppKit fetching its config on load
 * — and is worth paying for a picker that actually lists what the person has.
 *
 * Note that this list is only half the story: wagmi discovers every installed
 * wallet through EIP-6963 and adds each as its own named connector, so what the
 * picker shows is usually longer than what is written here.
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
