"use client";

import { useBestListings } from "@/hooks/useSeaportOrders";
import { useAllCollections } from "@/hooks/useAllCollections";
import { useDeferred } from "@/hooks/useDeferred";

/**
 * Read the chain while somebody is looking at the front page, so the page they
 * open next has already been read.
 *
 * The expensive part of a collection page is not the collection — it is the
 * Seaport order book, rebuilt from logs, which every page shares through one
 * React Query entry. Measured on a cold collection page, those log scans took
 * the RPC connection for 1.4 s in the gap between `totalSupply` and
 * `tokenByIndex`, the two reads every picture waits on. The control case is
 * the whole argument for this file: with that scan already cached,
 * `tokenByIndex` went out 26 ms after supply rather than 1,417 ms, and the
 * first image appeared at **2,177 ms instead of 4,669 ms**.
 *
 * The front page no longer needs any of it. Its grid is a list of named
 * pictures now, so the reads that used to block it are free to happen in the
 * background instead — the visitor is reading, and by the time they click,
 * the answer is in memory.
 *
 * Mounted late rather than gated internally, because these hooks fire on mount
 * and have no switch. Mounting is the switch.
 */
function Warm() {
  /** The order book. The one read worth having before it is asked for. */
  useBestListings();

  /** And what collections exist, which /collections and /market open with. */
  useAllCollections();

  return null;
}

export function WarmChain() {
  /**
   * After the pictures.
   *
   * Long enough that the first screen's images own the network while they are
   * arriving, short enough to be well inside the time anyone spends reading a
   * landing page before clicking anything.
   */
  const ready = useDeferred(1_500);
  return ready ? <Warm /> : null;
}
