import { TRENCHES_ADDRESS } from "@/config/trenches";

/**
 * Collections that carry the trading mark: pieces you cannot buy your way to
 * first, only trade your way to.
 *
 * Like `config/verified.ts`, it is a list of addresses with a reason, and the
 * mark takes an address — so there is one place that decides, and the tooltip
 * says why. It is not a verification: it describes how a collection is
 * earned, not who vouches for it.
 */

export interface TradingMarked {
  /** Shown as the tooltip and the accessible name. */
  reason: string;
}

const entries: Array<[string, TradingMarked]> = [
  [
    TRENCHES_ADDRESS,
    { reason: "Earned by trading. Every piece is claimed with SoDEX trading volume." },
  ],
];

export const TRADING_MARKED: Record<string, TradingMarked> = Object.fromEntries(
  entries.filter(([address]) => address !== "").map(([address, entry]) => [address.toLowerCase(), entry]),
);

export function tradingMarkOf(address: string | undefined): TradingMarked | undefined {
  return address === undefined ? undefined : TRADING_MARKED[address.toLowerCase()];
}
