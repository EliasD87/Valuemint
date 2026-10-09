/**
 * What the Explore page is told about the market, in one piece (2026-10-09).
 *
 * Built on the server from the index (lib/exploreSummary.ts) and baked into the
 * page, so the figures are in the first HTML: no chain read, no wallet, and no
 * request from the browser at all when the page was rendered with it. Every
 * amount is a decimal string, because it crosses from server to client as JSON
 * and a uint256 as a JSON number loses precision above 2^53.
 */

export interface ExploreCollection {
  /** Lower-cased. */
  address: string;
  /** From the contract, read once on the server. Absent if it would not answer. */
  name?: string;
  symbol?: string;
  /** The cheapest listing anyone can fill now, in wei. Absent when nothing is listed. */
  floorWei?: string;
  /** Today's floor against the floor 24 hours ago, in percent. Absent when either is unknown. */
  floorChange?: number;
  /** Pieces for sale now. */
  listed: number;
  /** Settled through Seaport, in wei, per window. */
  volume: { day: string; week: string; all: string };
  sales: { day: number; week: number; all: number };
}

export interface ExploreSale {
  collection: string;
  tokenId: string;
  /** Per unit, in wei. */
  priceWei: string;
  amount: string;
  /** When, estimated from the block number against the index's own head. */
  at: string;
}

export interface ExploreSummary {
  builtAt: string;
  totals: {
    /** Every sale, all time, in wei. */
    volumeWei: string;
    sales: number;
    /** Distinct buyers and sellers across those sales. */
    traders: number;
    /** Pieces listed and fillable at the last floor snapshot. */
    forSale: number;
  };
  /** Collections with a sale or a listing, busiest (all-time volume) first. */
  collections: ExploreCollection[];
  /** The newest sales, newest first. */
  latest: ExploreSale[];
}

export type ExploreWindow = "day" | "week" | "all";
