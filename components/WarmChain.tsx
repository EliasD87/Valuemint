"use client";

import { useBestListings } from "@/hooks/useSeaportOrders";
import { useAllCollections } from "@/hooks/useAllCollections";
import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { useTokenIds } from "@/hooks/useTokenIds";
import { useGenericTokens } from "@/hooks/useGenericTokens";
import { useDeferred } from "@/hooks/useDeferred";

/**
 * Read the chain while somebody is looking at the front page, so the page they
 * open next has already been read — but only what they look like opening.
 *
 * The first version of this warmed a list of collections on arrival, and it was
 * too expensive to be worth it. Measured on the live home page: twenty RPC
 * requests spanning 200 ms to 11,656 ms, peaking at seven in flight at once,
 * on a page whose own grid needs none. Everyone paid eleven seconds of
 * background load so that whoever clicked got an instant page, and while it ran
 * it competed for connections with the artwork and with any navigation. During
 * the chain upgrade, when a call took 1.1 s instead of 0.3 s, it was worse
 * again.
 *
 * So the cost moved to where the benefit is. A pointer resting on a card, or a
 * finger touching one, is the best signal available that somebody is about to
 * open it — and at that moment reading that ONE collection is cheap and almost
 * always useful. Somebody who scrolls past pays nothing.
 *
 * What is still warmed on arrival is the order book, and only that. It is one
 * shared scan every page reuses, and it is the single biggest thing a
 * collection page waits on: measured, with it already cached `tokenByIndex`
 * went out 26 ms after supply instead of 1,417 ms, and the first image appeared
 * at 2,177 ms instead of 4,669 ms.
 */

/**
 * One collection, read exactly as its own page reads it.
 *
 * Correctness rests on that: wagmi and React Query key on the call and the URL,
 * so issuing the same ones means the page finds these rather than refetching.
 * `useCollectionBasics` is shared with the page for this reason, and the
 * 60-token cap has to match for the same reason.
 */
export function WarmCollection({ address }: { address: `0x${string}` }) {
  const { supply } = useCollectionBasics(address);
  const { ids } = useTokenIds(address, supply, 60);
  useGenericTokens(address, ids);
  return null;
}

function Warm() {
  /** The order book. The one read worth having before anyone asks for it. */
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
  const ready = useDeferred(2_000);
  return ready ? <Warm /> : null;
}
