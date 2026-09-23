import { formatEther } from "viem";

/**
 * SOSO in dollars, for showing a balance's worth beside it.
 *
 * The price is CoinGecko's, where SoSoValue's token is listed as `sosovalue`
 * (checked 2026-09-23: symbol SOSO, rank 280). It is read from the visitor's
 * browser rather than through a route of ours: CoinGecko's free API refuses
 * shared cloud addresses readily, so a server proxy would fail for everyone at
 * once, while each browser asking for itself spreads the load and only ever
 * fails for one.
 *
 * Everything here is display. No figure in dollars is ever used to decide what
 * a transaction does — prices on this marketplace are set and paid in SOSO.
 */

export const SOSO_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=sosovalue&vs_currencies=usd";

/**
 * The price out of CoinGecko's answer, or nothing.
 *
 * Anything but a positive finite number is refused: a missing or zero price
 * would print "$0.00" beside a real balance, which states the balance is
 * worthless rather than that the price is unknown.
 */
export function parseSosoUsd(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const entry = (payload as Record<string, unknown>).sosovalue;
  if (typeof entry !== "object" || entry === null) return undefined;
  const usd = (entry as Record<string, unknown>).usd;
  return typeof usd === "number" && Number.isFinite(usd) && usd > 0 ? usd : undefined;
}

/** A SOSO amount in wei, in dollars at `price`. */
export function sosoToUsd(wei: bigint, price: number): number {
  return Number(formatEther(wei)) * price;
}

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$4,429.87". A real amount under a cent says "<$0.01" rather than "$0.00". */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.005) return "<$0.01";
  return DOLLARS.format(value);
}
