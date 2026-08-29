import { formatEther } from "viem";

/** `0x1c65…64bb` — enough to recognise an address, short enough to sit in a row. */
export function shortAddress(address?: string, size = 4): string {
  if (address === undefined || address.length < 2 * size + 2) return address ?? "";
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

/**
 * SOSO amounts, trimmed to something a human reads at a glance.
 *
 * Gas here costs millionths of a token, so fixed decimal places either drown the
 * number in zeros or round a real fee away to nothing. This keeps significance
 * instead of position.
 */
export function formatSoso(wei: bigint | undefined, maxDecimals = 4): string {
  if (wei === undefined) return "—";
  if (wei === 0n) return "0";

  const asNumber = Number(formatEther(wei));

  if (asNumber > 0 && asNumber < 0.0001) {
    // Small enough that any rounding lies; show that it is non-zero instead.
    return "<0.0001";
  }

  const trimmed = asNumber.toFixed(maxDecimals).replace(/\.?0+$/, "");
  return trimmed === "" ? "0" : trimmed;
}

export function formatSosoWithSymbol(wei: bigint | undefined, maxDecimals = 4): string {
  return `${formatSoso(wei, maxDecimals)} SOSO`;
}

/** Whole numbers with separators, for counts and supply. */
export function formatCount(value: bigint | number | undefined): string {
  if (value === undefined) return "—";
  return Number(value).toLocaleString("en-US");
}

export function explorerUrl(explorer: string, kind: "tx" | "address" | "token", value: string): string {
  return `${explorer}/${kind}/${value}`;
}

/**
 * Turns whatever a token's metadata says its image is into something a browser can
 * load. Some collections store `ipfs://`, and public gateways are unreliable for
 * freshly pinned content, so those are rewritten to a gateway known to serve it.
 */
/**
 * The public site a contract's metadata may point at.
 *
 * A collection's `baseURI` is immutable, so it has to name the production
 * domain even when the collection was created from a laptop. That is correct
 * on chain and unhelpful in development: the browser dutifully requests
 * https://www.valuemint.store/... which does not answer until the site ships,
 * and every token renders blank.
 */
const SITE_ORIGIN = "https://www.valuemint.store";

export function resolveMediaUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "") return undefined;

  if (raw.startsWith("ipfs://")) {
    return `https://lavender-tiny-loon-904.mypinata.cloud/ipfs/${raw.slice("ipfs://".length)}`;
  }

  // In development only, resolve our own domain to whatever host is serving
  // this page, so a collection whose metadata we serve is visible before the
  // site is deployed. Never applied in production, where the URL is already
  // right and rewriting it would be a way to point tokens somewhere unintended.
  if (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    raw.startsWith(`${SITE_ORIGIN}/`)
  ) {
    return `${window.location.origin}${raw.slice(SITE_ORIGIN.length)}`;
  }

  return raw;
}

/** "3 minutes ago", for activity feeds. */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return "just now";

  const units: Array<[number, string]> = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
  ];

  let last: [number, string] = units[0]!;
  for (const unit of units) {
    if (seconds < unit[0] * 60 || unit === units[units.length - 1]) {
      const count = Math.floor(seconds / unit[0]);
      last = unit;
      if (seconds < unit[0] * 60) {
        return `${count} ${unit[1]}${count === 1 ? "" : "s"} ago`;
      }
    }
  }

  const count = Math.floor(seconds / last[0]);
  return `${count} ${last[1]}${count === 1 ? "" : "s"} ago`;
}
