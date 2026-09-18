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
  contracts: {
    /**
     * Multicall3, and the single most expensive omission this app has had.
     *
     * `contracts` was `{}`. viem only aggregates `useReadContracts` into one
     * `eth_call` when it knows a multicall3 address for the chain, so with this
     * empty every batched read fell back to one HTTP round trip per contract
     * call. Measured on the live site before this line existed: loading
     * /collections issued **123 RPC requests in 114 separate waves**, first at
     * 1,988ms and last at 23,462ms — twenty-one seconds of serial round trips
     * at ~180ms each, during which the app does not yet know a single image URL
     * to request. The artwork was never the slow part; waiting to find out
     * which artwork was.
     *
     * The contract is already there. Multicall3 is deployed by deterministic
     * CREATE2 at the same address on most chains, and it is on ValueChain:
     * 3,808 bytes of code at 0xcA11…CA11, and `getBlockNumber()` answers.
     * Nothing had to be deployed; the chain definition simply never said so.
     */
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
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
  // Same deterministic address, confirmed deployed here too.
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
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

/**
 * WebSocket endpoints, same idea and for the same reason.
 *
 * This existed only as a literal inside the chain definition, and `wagmi.ts`
 * puts the socket in the same ranked fallback as the HTTP endpoints - so
 * setting `NEXT_PUBLIC_RPC_URLS` alone moved only part of the traffic off the
 * public node and left the rest on it, which is a confusing thing to discover
 * after paying for a private one.
 *
 * Comma separated, highest preference first, exactly like `NEXT_PUBLIC_RPC_URLS`.
 * Both should be set together, or neither.
 *
 * **These are `NEXT_PUBLIC_`, so whatever is here ships in the browser bundle
 * and is readable by anyone.** That is unavoidable - the reads happen in the
 * visitor's browser, so there is nowhere to hide a URL. A private endpoint here
 * therefore has to be one that is safe to publish: restricted by origin or
 * referrer to this site, or rate limited per caller by whoever runs it. A
 * secret key embedded in the URL would not be secret.
 */
export const RPC_WS: string[] = (() => {
  const configured = (process.env.NEXT_PUBLIC_RPC_WS_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u !== "");
  if (configured.length > 0) return configured;
  return ["wss://mainnet-ws.valuechain.xyz"];
})();
