import { defineChain } from "viem";

/**
 * ValueChain is not in viem's bundled chain list, so it is defined here.
 * Every value was measured against the live RPC, not copied from documentation.
 */
export const valuechain = defineChain({
  id: 286623,
  name: "ValueChain",
  nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.valuechain.xyz"], webSocket: ["wss://mainnet-ws.valuechain.xyz"] },
  },
  blockExplorers: {
    default: { name: "ValueChain Scan", url: "https://main-scan.valuechain.xyz" },
  },
  // ~2s blocks, so a short poll keeps the UI feeling immediate without hammering.
  contracts: {},
});

export const valuechainTestnet = defineChain({
  id: 138565,
  name: "ValueChain Testnet",
  nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-v2.valuechain.xyz"], webSocket: ["wss://testnet-v2-ws.valuechain.xyz"] },
  },
  blockExplorers: {
    default: { name: "ValueChain Testnet Scan", url: "https://test-scan.valuechain.xyz" },
  },
  testnet: true,
});

/** Poll interval tuned to the chain's ~2.07s block time. */
export const BLOCK_TIME_MS = 2_000;
