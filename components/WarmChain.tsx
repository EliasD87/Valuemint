"use client";

import { useBestListings } from "@/hooks/useSeaportOrders";
import { useAllCollections } from "@/hooks/useAllCollections";
import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { useTokenIds } from "@/hooks/useTokenIds";
import { useGenericTokens } from "@/hooks/useGenericTokens";
import { useDeferred } from "@/hooks/useDeferred";
import { WARM_COLLECTIONS } from "@/config/featured";

/**
 * Read the chain while somebody is looking at the front page, so the page they
 * open next has already been read.
 *
 * Two ways in, because they catch different people.
 *
 *   - **A short list, in the background.** `WARM_COLLECTIONS` names where
 *     people actually go — the treasure boxes and both Cybereators — and they
 *     are read one at a time, three seconds apart, starting once the artwork
 *     has had the network to itself. This is for everyone who clicks without
 *     hovering first, which on a phone is everyone.
 *   - **On intent.** A pointer resting on a card, a finger touching one, or
 *     focus landing on it warms that collection immediately. See
 *     `FeaturedGrid`.
 *
 * The spacing is the lesson, not the idea. The first version warmed all three
 * starting 1.5 s in and cost twenty RPC requests spanning 200 ms to 11,656 ms,
 * peaking at seven in flight — on a page whose own grid needs none. It competed
 * with the artwork and with navigation, and during the chain upgrade, when a
 * call took 1.1 s instead of 0.3 s, it was worse again. Sequenced and started
 * later, the same work is invisible.
 *
 * What is warmed on arrival regardless is the order book, and only that. It is
 * one shared scan every page reuses and the single biggest thing a collection
 * page waits on: measured, with it already cached `tokenByIndex` went out 26 ms
 * after supply instead of 1,417 ms, and the first image appeared at 2,177 ms
 * instead of 4,669 ms.
 */

/**
 * One collection, read exactly as its own page reads it.
 *
 * Correctness rests on that: wagmi and React Query key on the call and the URL,
 * so issuing the same ones means the page finds these rather than refetching.
 * `useCollectionBasics` is shared with the page for this reason, and the
 * 60-token cap has to match for the same reason.
 */
/** The rows a collection page shows before anybody scrolls. */
const FIRST_SCREEN = 12;

export function WarmCollection({ address }: { address: `0x${string}` }) {
  const { supply } = useCollectionBasics(address);

  /** 60 — the collection page's own cap. A different number would miss its cache. */
  const { ids } = useTokenIds(address, supply, 60);

  /**
   * All sixty token URIs, but only the first screen's documents.
   *
   * The URIs are RPC and batch into one multicall, so warming all of them costs
   * a single request and the page finds them. The documents do not batch when
   * they belong to somebody else — Cybereator's are one URL per token on a host
   * with no cache headers — and warming two Cybereator collections in full was
   * measured at 132 requests to that host per home-page visit, from people who
   * had not clicked anything.
   *
   * Twelve is what fills the screen on arrival. The rest load as they are
   * scrolled to, which is what would have happened anyway.
   */
  useGenericTokens(address, ids, { documents: FIRST_SCREEN });

  return null;
}

function Warm() {
  /** The order book. The one read worth having before anyone asks for it. */
  useBestListings();

  /** And what collections exist, which /collections and /market open with. */
  useAllCollections();

  return null;
}

/**
 * One collection at a time, each waiting for the one before it.
 *
 * Mounting is the only switch these hooks have, so a queue is a chain of
 * components that mount in sequence. Spacing matters: the first version of this
 * started all three 1.5 s in and cost twenty RPC requests over 11.6 seconds,
 * peaking at seven at once, which is what made the front page feel slow. Three
 * seconds apart, starting after the artwork has had the network to itself, is
 * background work rather than competition.
 */
function WarmQueue({ addresses, after }: { addresses: readonly `0x${string}`[]; after: number }) {
  const ready = useDeferred(after);
  const [first, ...rest] = addresses;

  if (!ready || first === undefined) return null;

  return (
    <>
      <WarmCollection address={first} />
      {rest.length > 0 ? <WarmQueue addresses={rest} after={3_000} /> : null}
    </>
  );
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
  if (!ready) return null;

  return (
    <>
      <Warm />
      {/*
        And the collections people actually open — the boxes and both
        Cybereators. Hovering a card still warms it immediately; this is for
        everyone who clicks without hovering first, which on a phone is
        everyone.
      */}
      <WarmQueue addresses={WARM_COLLECTIONS} after={2_500} />
    </>
  );
}
