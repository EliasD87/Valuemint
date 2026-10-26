/**
 * What the front page is told on the server, beside the market summary
 * (lib/exploreTypes.ts), so its first screen draws without reading the chain
 * from the browser (2026-10-25). Built by lib/frontSnapshot.ts.
 *
 * Every amount is a decimal string, for the same reason as the summary's: it
 * crosses from server to client as JSON, and a uint256 as a JSON number loses
 * precision above 2^53.
 */

import type { TokenMetadata } from "@/lib/tokenMetadata";

export interface FrontMint {
  priceWei: string;
  minted: string;
  cap: string;
  remaining: string;
}

export interface FrontCollection {
  /** Lower-cased. */
  address: string;
  name?: string;
  symbol?: string;
  /** Present only while its public mint is open with pieces left. */
  mint?: FrontMint;
}

export interface FrontPiece {
  /** Lower-cased. */
  collection: string;
  tokenId: string;
  /** Seaport's order hash. */
  hash: string;
  /** The seller. */
  maker: string;
  /** What the buyer pays for the whole lot, fee included. Per piece is this over `amount`. */
  priceWei: string;
  amount: string;
  /** The block that validated it: the only "listed at" an order has. */
  blockNumber: string;
  /** The token's `tokenURI` as the contract answered at build. */
  uri?: string;
  /** Its document, trimmed to what a card reads. Absent when the host would not answer in time. */
  metadata?: TokenMetadata;
}

export interface FrontSnapshot {
  builtAt: string;
  /**
   * The collections the server vouches for: `config/known.ts` and the curated
   * lists in `config/featured.ts`, minus `config/hidden.ts`. The browser's
   * own registry adds to these once it loads; it never needs to remove any.
   */
  collections: FrontCollection[];
  /**
   * Each collection's newest and cheapest live listings, checked against
   * Seaport and the token's owner when this was built. A head start for
   * drawing, not a price anyone pays: the token page re-checks before a buy,
   * and the browser's own order book replaces this list as soon as it lands.
   */
  pieces: FrontPiece[];
}
