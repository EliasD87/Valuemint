"use client";

import { createConfig, fallback, http, webSocket } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { valuechain, BLOCK_TIME_MS, RPC_HTTP, RPC_WS } from "@/config/chain";

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
  /**
   * Aggregate independent `eth_call`s into multicall3, not just the ones a
   * single `useReadContracts` asks for.
   *
   * The chain definition gaining a multicall3 address fixes batched reads. This
   * fixes the other half: the many separate `useReadContract` calls scattered
   * across a page — `ownerOf` here, `tokenURI` there, a balance in a third
   * component — which viem otherwise sends one HTTP request at a time because
   * nothing told it they could travel together.
   *
   * `wait` is the window it holds a call open looking for companions. 16ms is
   * about one frame: long enough for a render pass to queue everything a page
   * mounts at once, short enough that nobody perceives it.
   */
  /**
   * `batchSize` in BYTES of calldata, and the default is 1024 - which is small
   * enough to matter.
   *
   * `getOrderStatus(bytes32)` is 36 bytes of calldata, so the default packs 28
   * of them into a chunk. At the 2,000-order ceiling the order book's periodic
   * re-check costs 569 separate `eth_call`s every 25 seconds *per open tab*,
   * and there is no shared read path - no server caches any of this - so
   * visitors multiply that load rather than share it. 100 people on /market is
   * ~2,300 eth_call/s at the ceiling, against a public node nobody here owns.
   *
   * Measured against that node, 400 real `ownerOf` calls:
   *
   *    1024 (default)   15 chunks   1356ms
   *    4096              4 chunks    648ms
   *    8192              2 chunks    724ms
   *   16384              1 chunk    1032ms
   *
   * 8192 is the knee. It is 7.5x fewer requests for identical data and the same
   * wall time; past it a single call gets slower without costing the node less.
   * The work the node does is unchanged either way - this is purely about how
   * many requests it is asked in.
   */
  batch: { multicall: { wait: 16, batchSize: 8192 } },
  transports: {
    [valuechain.id]: fallback(
      [
        ...RPC_WS.map((url) => webSocket(url, { retryCount: 2 })),
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
