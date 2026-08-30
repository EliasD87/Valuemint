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

/**
 * HTTP endpoints, in preference order, for the fallback transport.
 *
 * More than one on purpose. Every page here is assembled from chain reads, so a
 * single endpoint failing did not slow the site down, it emptied it — and that
 * endpoint is not ours.
 *
 * `NEXT_PUBLIC_RPC_URLS` (comma separated) takes precedence, so an operator can
 * point at a private or paid node without a code change. That is the right
 * answer at any real traffic: a public endpoint shared by every visitor is a
 * rate limit waiting to be found.
 */
export const RPC_HTTP: string[] = (() => {
  const configured = (process.env.NEXT_PUBLIC_RPC_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u !== "");
  if (configured.length > 0) return configured;
  // Both verified live: same chain id (0x45f9f) and within one block of each
  // other. A guessed hostname here would cost a DNS failure on every failover.
  return ["https://mainnet.valuechain.xyz", "https://rpc.valuechain.xyz"];
})();
