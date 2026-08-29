"use client";

import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { valuechain, BLOCK_TIME_MS } from "@/config/chain";

/**
 * Injected-only by design: no WalletConnect project id to obtain, nothing phoning
 * home, and MetaMask covers everyone who can already reach a chain this new.
 */
export const wagmiConfig = createConfig({
  chains: [valuechain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [valuechain.id]: http("https://mainnet.valuechain.xyz", {
      batch: true,
      retryCount: 3,
    }),
  },
  pollingInterval: BLOCK_TIME_MS,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
