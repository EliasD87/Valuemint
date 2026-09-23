import { formatEther } from "viem";

/** `0x1c65…64bb` — enough to recognise an address, short enough to sit in a row. */
export function shortAddress(address?: string, size = 4): string {
  if (address === undefined || address.length < 2 * size + 2) return address ?? "";
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

/**
 * `0x36…3136` — four characters from each end, counting the `0x`.
 *
 * Shorter than `shortAddress`, which keeps the prefix AND four hex digits, so
 * its head is six characters wide. That is the right trade nearly everywhere;
 * it is the wrong one in the header, where the pill shares a row with the nav
 * and every character it drops is a character the layout does not have to find.
 *
 * A separate function rather than a parameter on the one above, because that
 * one's `size` sets both ends at once: asking it for a four-wide head would
 * silently give a two-character tail, which is not enough to tell two addresses
 * apart. Here the two ends are stated and independent.
 */
export function tinyAddress(address?: string): string {
  if (address === undefined || address.length < 10) return address ?? "";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
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

  /* Trim zeros from the fraction only. Anchored on the point: the unanchored
     `/\.?0+$/` also ate a whole number's own zeros, so `(2500, 0)` read "25". */
  const trimmed = asNumber.toFixed(maxDecimals).replace(/\.(\d*?)0+$/, ".$1").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

/**
 * SOSO to exactly `decimals` places, for a column of figures.
 *
 * `formatSoso` keeps significance, which is right for one amount on its own and
 * wrong for a column: "5400", "2505.0001" and "0.022" side by side have no
 * shared decimal point to read down. Fixed places give every row the same
 * shape. A non-zero amount that would print as all zeros says "<0.01" instead,
 * because "0.00" in a volume column reads as "nothing sold", which is false.
 */
export function formatSosoFixed(wei: bigint | undefined, decimals = 2): string {
  if (wei === undefined) return "—";
  const asNumber = Number(formatEther(wei));
  const step = 10 ** -decimals;
  if (asNumber > 0 && asNumber < step / 2) return `<${step.toFixed(decimals)}`;
  return asNumber.toFixed(decimals);
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

/**
 * Pinata's dedicated gateway for this project, and the public one to use
 * instead.
 *
 * The dedicated gateway's free plan has exhausted its request allowance and now
 * answers every request with
 * `403 The limits on this dedicated gateway's free plan have been exceeded`.
 * The content is fine and still pinned - `gateway.pinata.cloud` serves the same
 * CIDs at 200 - so this is a hostname problem, not a data problem.
 *
 * It has to be fixed here because the dead host is not only in our config. It
 * is baked into two collections' on-chain `baseURI`:
 *
 *   Genesis  tokenURI(1) -> https://lavender-tiny-loon-904.mypinata.cloud/ipfs/bafybeidu5q.../1
 *   Hypno    tokenURI(1) -> https://lavender-tiny-loon-904.mypinata.cloud/ipfs/bafybeieigd.../1
 *
 * Those strings are immutable without an on-chain `setBaseURI` from the
 * collection owner, so the metadata document itself - not just its image - was
 * unreachable. Every URL the app follows passes through here, so rewriting the
 * host at this one point reaches the on-chain case as well as our own config.
 *
 * IPFS is content-addressed: the same CID through a different gateway is the
 * same bytes. Swapping the host cannot change what a token depicts.
 */
const EXHAUSTED_GATEWAY = "lavender-tiny-loon-904.mypinata.cloud";
const REPLACEMENT_GATEWAY = "gateway.pinata.cloud";

function liveGateway(url: string): string {
  return url.includes(EXHAUSTED_GATEWAY)
    ? url.replace(EXHAUSTED_GATEWAY, REPLACEMENT_GATEWAY)
    : url;
}

export function resolveMediaUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "") return undefined;

  if (raw.startsWith("ipfs://")) {
    return `https://${REPLACEMENT_GATEWAY}/ipfs/${raw.slice("ipfs://".length)}`;
  }

  raw = liveGateway(raw);

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
