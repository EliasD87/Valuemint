"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import {
  createPublicClient,
  erc20Abi,
  erc721Abi,
  fallback,
  http,
  parseAbiItem,
  type Address,
  type ContractFunctionParameters,
  type Hex,
} from "viem";
import { RPC_HTTP, valuechain } from "@/config/chain";
import { SEAPORT, SEAPORT_FROM_BLOCK, SeaportAbi } from "@/config/seaport";
import { scanLogs } from "@/lib/logScan";
import { capCandidates } from "@/lib/orderBook";
import { useIndexedOrders } from "@/hooks/useIndexedOrders";
import {
  forgetSeenOrders,
  pendingOrdersServerSnapshot,
  pendingOrdersSnapshot,
  subscribePendingOrders,
} from "@/lib/pendingOrders";
import {
  ItemType,
  isExpired,
  orderBookFloor,
  readOrder,
  type OrderParameters,
  type ReadOrder,
  unfillableReason,
  type SeaportOrder,
  resolveFillable,
} from "@/lib/seaport";

export type { SeaportOrder } from "@/lib/seaport";

/**
 * Every live Seaport order.
 *
 * Orders are put on chain with `validate()`, and Seaport's `OrderValidated`
 * event carries the *entire* order - not a hash, not a pointer, the full
 * parameters. So the order book is reconstructible by anyone with an RPC
 * endpoint, and there is no database that can lose an order or censor one.
 *
 * That last claim used to read "and nothing else", because the scan below was
 * the only way in. It is not any more: `useIndexedOrders` asks a cached copy
 * first and this scan runs when that copy cannot answer. The claim survives the
 * change intact, and it is worth being precise about why, because "we added a
 * database to the marketplace" is exactly the kind of sentence that should
 * invite suspicion.
 *
 * The index supplies *candidates* and nothing more - which announcements exist.
 * Every question whose answer could cost someone money is still put to the
 * chain, below, for every order on every poll: is it cancelled, is it filled,
 * has its maker voided it, has it expired, does the maker still hold the token
 * and still permit Seaport to move it. And the price is never taken from the
 * index at all; `readOrder` derives it from the parameters the wallet is about
 * to be handed.
 *
 * So an index that is wrong, stopped, or replaced outright can make an order
 * appear that the next check rejects, or fail to mention one the chain would
 * have shown. It cannot misprice anything, cannot forge an order Seaport will
 * settle, and cannot take the market down: when it stops answering, this scan
 * simply runs again.
 *
 * Three things can retire an order, and all three are checked here because
 * missing any one of them means showing a listing that cannot be bought:
 *
 *   cancelled or filled   `getOrderStatus`, one batched call per order.
 *   expired               its own `endTime`.
 *   counter incremented   the offerer voided everything at once.
 *
 * That last one is the subtle one. `incrementCounter` does not touch any
 * individual order's status - it changes the hash that future fulfilments
 * compute, so a standing order becomes unreachable while still reporting itself
 * validated. Detecting it by re-deriving each hash would cost a call per order;
 * detecting it from the `CounterIncremented` log costs one scan for all of them.
 */

const ORDER_VALIDATED = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

const COUNTER_INCREMENTED = parseAbiItem(
  "event CounterIncremented(uint256 newCounter, address indexed offerer)",
);


/** ERC-1155 has no `ownerOf`; a holding is a balance. */
const erc1155BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Its own client, because this runs outside a component's chain context - but
 * with the same fallback the wagmi transport has. Pinned to a single endpoint,
 * a feed like this reintroduces exactly the single point of failure the
 * fallback exists to remove: the page does not get slower, it goes empty.
 */
const client = createPublicClient({
  chain: valuechain,
  transport: fallback(
    RPC_HTTP.map((url) => http(url, { batch: true, retryCount: 2 })),
    { rank: { interval: 60_000 } },
  ),
});

interface Candidate {
  hash: Hex;
  params: OrderParameters;
  blockNumber: bigint;
  read: ReadOrder;
}

/**
 * Every order Seaport has ever been told about, decoded but not yet filtered.
 *
 * Cached by `scanLogs`, so the first call walks the chain once and every call
 * after it reads only new blocks.
 */
function useValidatedOrders(enabled = true) {
  return useQuery({
    queryKey: ["seaport-validated"],
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ candidates: Candidate[]; voidedAfter: Map<string, bigint> }> => {
      /**
       * Only look back as far as a live order can possibly be.
       *
       * Every order expires within 90 days, so anything older than the window is
       * dead by definition and re-reading it costs a request per 20,000 blocks
       * for nothing. Without this the scan grows with the age of the chain
       * forever; with it, the order book is bounded no matter how old ValueChain
       * gets. The floor is rounded so it does not move between polls — see
       * `orderBookFloor`.
       *
       * `useActivity` deliberately does NOT do this: a sale from six months ago
       * is still history worth showing, so it keeps reading from the deployment
       * block. That means the two stop sharing a cached scan once the chain is
       * older than the window, which is the point at which sales history wants a
       * cached route of its own rather than every visitor walking the chain.
       */
      const floor = orderBookFloor(await client.getBlockNumber(), SEAPORT_FROM_BLOCK);

      const [validated, counters] = await Promise.all([
        scanLogs(client, { address: SEAPORT, event: ORDER_VALIDATED, fromBlock: floor }),
        scanLogs(client, { address: SEAPORT, event: COUNTER_INCREMENTED, fromBlock: floor }),
      ]);

      /** Offerer -> the block in which they last voided everything standing. */
      const voidedAfter = new Map<string, bigint>();
      for (const log of counters) {
        const args = log.args as { offerer?: Address };
        if (args.offerer === undefined) continue;
        const key = args.offerer.toLowerCase();
        const at = log.blockNumber;
        if ((voidedAfter.get(key) ?? 0n) < at) voidedAfter.set(key, at);
      }

      /**
       * An order can be validated more than once - it is idempotent, and a
       * second `validate` of the same parameters emits a second event. Keyed by
       * hash so the same order is one entry however often it was announced.
       */
      const byHash = new Map<string, Candidate>();
      for (const log of validated) {
        const args = log.args as { orderHash?: Hex; orderParameters?: OrderParameters };
        if (args.orderHash === undefined || args.orderParameters === undefined) continue;

        const read = readOrder(args.orderParameters);
        if (read === undefined) continue; // A shape this app does not price.

        /**
         * The LATEST validation wins, not the earliest.
         *
         * This was `existing.blockNumber <= log.blockNumber`, which kept the
         * first announcement of an order and discarded every later one. That is
         * fine on its own — the parameters are identical — and wrong the moment
         * it meets `voidedAfter`: a maker who calls `incrementCounter` to void
         * everything and then re-validates an order is live again on chain, but
         * the book still remembered the ORIGINAL block, which is before the
         * increment. So the re-listed order was hidden from everyone, including
         * the seller, with no way to bring it back short of a new order hash.
         *
         * Keeping the most recent validation is what makes "validated after the
         * counter moved" mean what it says.
         */
        const existing = byHash.get(args.orderHash);
        if (existing !== undefined && existing.blockNumber >= log.blockNumber) continue;

        byHash.set(args.orderHash, {
          hash: args.orderHash,
          params: args.orderParameters,
          blockNumber: log.blockNumber,
          read,
        });
      }

      /**
       * Newest first, and bounded.
       *
       * `validate()` is permissionless and costs a fraction of a cent here, so
       * the candidate set is attacker-controlled: a hundred thousand junk
       * orders that merely decode into something `readOrder` accepts would each
       * earn a `getOrderStatus` and two fillability reads, from every visitor,
       * every thirty seconds. `orderBookFloor` bounds the scan by *time*, which
       * is not the dimension an attacker controls.
       *
       * The rule itself now lives in `lib/orderBook.ts`, because the index is a
       * second way into this set and a cap inside the scan would guard only the
       * scan. See there for why it is per-offerer as well as global.
       */
      const candidates = capCandidates([...byHash.values()]);
      /**
       * Which source answered, in development only.
       *
       * There are two now, and "why is my listing not showing" has a different
       * answer depending on which one a page used. A line in the console is the
       * cheapest way to tell them apart; in production it would be noise on
       * every poll.
       */
      if (process.env.NODE_ENV === "development") {
        console.info(`[order book] chain scan: ${candidates.length} candidates`);
      }
      return { candidates, voidedAfter };
    },
  });
}

/**
 * Live orders: validated, not cancelled, not filled out, not expired, and not
 * swept away by a counter increment.
 *
 * Deliberately returns *all* of them rather than taking a filter. Every page
 * needs a different slice - one collection, one token, one account's bids - and
 * the expensive part, the log scan, is shared between them by react-query. A
 * hook per slice would mean a scan per slice.
 */
export function useSeaportOrders(enabled = true) {
  /**
   * Two sources for the same announcements, and the chain is the one that
   * always works.
   *
   * The index is asked first because the scan it replaces costs eleven
   * `eth_getLogs` on a cold page and gains about two more every day the chain
   * keeps mining — the growth `orderBookFloor` bounds by hiding old orders
   * rather than by getting cheaper.
   *
   * The scan stays `enabled` only while the index cannot answer, so the two are
   * never both running: no index configured, the route down, or a reader that
   * has stopped committing. That costs one extra round trip on the way to the
   * fallback and keeps the chain path permanently exercised rather than
   * becoming code nobody has run in six months.
   *
   * Nothing downstream of here changed. Whichever source produced them, every
   * candidate still faces `getOrderStatus`, the counter rule, its own expiry
   * and a live fillability read before anyone is shown a price.
   */
  const indexed = useIndexedOrders(enabled);
  const scan = useValidatedOrders(enabled && indexed.unavailable);

  const data = indexed.book ?? scan.data;
  const scanning = indexed.isLoading || (indexed.unavailable && scan.isLoading);
  const error = indexed.unavailable ? scan.error : null;

  /**
   * Orders this tab placed moments ago, which the scan cannot have yet.
   *
   * It reads six confirmations behind the head and polls every thirty seconds,
   * so a freshly placed offer is invisible here for the better part of a minute
   * — mined, paid for, and absent. The browser that placed it does not need to
   * be told: it has the receipt. See `lib/pendingOrders.ts`.
   */
  const pending = useSyncExternalStore(
    subscribePendingOrders,
    pendingOrdersSnapshot,
    pendingOrdersServerSnapshot,
  );

  const candidates = useMemo(() => {
    const scanned = data?.candidates ?? [];
    if (pending.length === 0) return scanned;

    /**
     * The scan wins wherever the two overlap, and the duplicate is dropped
     * rather than shown twice. `forgetSeenOrders` then clears it for good, so
     * this only has to hold until the next poll.
     */
    const known = new Set(scanned.map((c) => c.hash.toLowerCase()));
    const unseen = pending.filter((p) => !known.has(p.hash.toLowerCase()));
    return unseen.length === 0 ? scanned : [...unseen, ...scanned];
  }, [data, pending]);

  /**
   * Once the scan reports an order, stop holding a copy of it — two sources for
   * one order can only end in the two disagreeing about its status.
   */
  useEffect(() => {
    const scanned = data?.candidates;
    if (scanned !== undefined && scanned.length > 0) {
      forgetSeenOrders(scanned.map((c) => c.hash));
    }
  }, [data]);

  /**
   * An event proves an order existed, never that it still does. Batched through
   * multicall3, so this is one `eth_call` rather than one per order.
   */
  const { data: statuses, isLoading: loadingStatus } = useReadContracts({
    contracts: candidates.map((c) => ({
      address: SEAPORT,
      abi: SeaportAbi,
      functionName: "getOrderStatus" as const,
      args: [c.hash],
    })),
    query: { enabled: candidates.length > 0, refetchInterval: 25_000 },
  });

  /** Orders that Seaport itself still considers open. Fillability comes next. */
  const standing = useMemo(() => {
    const voidedAfter = data?.voidedAfter ?? new Map<string, bigint>();
    const now = Math.floor(Date.now() / 1000);

    return candidates
      .map((c, i) => {
        const entry = statuses?.[i];
        if (entry?.status !== "success") return undefined;

        const [isValidated, isCancelled, filled, size] = entry.result as [
          boolean,
          boolean,
          bigint,
          bigint,
        ];

        if (!isValidated || isCancelled) return undefined;
        // `size` is 0 until something is filled; once set, filled >= size is done.
        if (size > 0n && filled >= size) return undefined;
        if (isExpired(c.read.endTime, now)) return undefined;

        const voided = voidedAfter.get(c.read.maker.toLowerCase());
        if (voided !== undefined && voided >= c.blockNumber) return undefined;

        return { ...c.read, hash: c.hash, params: c.params, blockNumber: c.blockNumber, filled, size };
      })
      .filter((o): o is Omit<SeaportOrder, "fillable"> => o !== undefined);
  }, [candidates, statuses, data]);

  /**
   * Can the maker still deliver what they promised?
   *
   * Seaport tracks cancellation and fills, and nothing else. It does not know
   * the seller handed the token to someone else — so a listing survives the
   * token leaving, and comes back to life if it ever returns. Checking this
   * belongs here rather than in each page: the token page did it and the cards
   * did not, so the same stale listing was hidden in one place and offered for
   * sale in another.
   *
   * Two reads per order, batched through multicall3 and only for tokens that
   * actually carry an order, which is a small set.
   */
  /**
   * Typed explicitly because the two branches use different ABIs, and inference
   * over a mixed `flatMap` collapses to `unknown[]`.
   */
  const fillabilityReads = standing.flatMap((o): ContractFunctionParameters[] => {
      if (o.kind === "listing") {
        const isMulti = o.params.offer[0]?.itemType === ItemType.ERC1155;
        return [
          isMulti
            ? {
                address: o.collection,
                abi: erc1155BalanceAbi,
                functionName: "balanceOf" as const,
                args: [o.maker, o.tokenId ?? 0n],
              }
            : {
                address: o.collection,
                abi: erc721Abi,
                functionName: "ownerOf" as const,
                args: [o.tokenId ?? 0n],
              },
          {
            address: o.collection,
            abi: erc721Abi,
            functionName: "isApprovedForAll" as const,
            args: [o.maker, SEAPORT],
          },
        ];
      }
      /**
       * A bid is only real while the money is. A bidder who spent or unwrapped
       * their WSOSO leaves an offer a holder can accept, pay gas for, and watch
       * revert — which is worse than the offer never showing at all.
       */
      return [
        { address: o.currency, abi: erc20Abi, functionName: "balanceOf" as const, args: [o.maker] },
        {
          address: o.currency,
          abi: erc20Abi,
          functionName: "allowance" as const,
          args: [o.maker, SEAPORT],
        },
      ];
  });

  const { data: fillChecks, isError: fillChecksFailed } = useReadContracts({
    contracts: fillabilityReads,
    query: { enabled: standing.length > 0, refetchInterval: 25_000 },
  });

  /**
   * Whether fillability is known yet, as opposed to true or false.
   *
   * There are three states here and the code below used to have two. See the
   * note on the `fillChecks === undefined` branch.
   */
  const checking = standing.length > 0 && fillChecks === undefined && !fillChecksFailed;

  const all = useMemo<SeaportOrder[]>(
    () =>
      standing.map((o, i) => {
        /**
         * Three states, not two: not checked yet, checked and refused, checked
         * and answered. `resolveFillable` in `lib/seaport.ts` is the rule and
         * carries the reasoning and the tests; the one thing worth repeating
         * here is that "not checked yet" is NOT fillable, and `isLoading` below
         * is what keeps that from reading as an empty market.
         */
        const checks =
          fillChecks === undefined
            ? undefined
            : { first: fillChecks[i * 2], second: fillChecks[i * 2 + 1] };

        return {
          ...o,
          fillable: resolveFillable(o, checks),
          /**
           * The same two answers, read for a different question. Nothing extra
           * is fetched — this was already being computed and discarded.
           */
          unfillable: unfillableReason(o, checks),
        };
      }),
    [standing, fillChecks],
  );

  /**
   * Trait offers, kept out of `orders` entirely (2026-09-25).
   *
   * A trait offer names no token, exactly like a collection offer, and every
   * screen written before trait offers existed reads "no token" as "any
   * piece". Left in `orders`, one would have appeared on every piece in the
   * collection as acceptable — and a Common holder would have been shown an
   * "Uncommon" bid they cannot fill. Kept apart, the older screens behave
   * exactly as before, and each place that shows a trait offer does so on
   * purpose, after checking the piece is in its set.
   */
  const { orders, traitOffers } = useMemo(() => {
    const isTrait = (o: SeaportOrder) => o.kind === "offer" && o.criteria !== undefined && o.criteria !== 0n;
    return { orders: all.filter((o) => !isTrait(o)), traitOffers: all.filter(isTrait) };
  }, [all]);

  return {
    orders,
    traitOffers,
    /**
     * `checking` belongs here, not in a separate flag.
     *
     * Every public view filters on `fillable`, which is now `false` until the
     * ownership reads land. Without this the market would render its empty
     * state for a second or two on every load and then fill in — which reads
     * as "nothing for sale" at exactly the moment somebody arrived to buy.
     */
    isLoading: scanning || loadingStatus || checking,
    /**
     * The feed is built from logs; if the endpoint refuses them, say so rather
     * than showing an empty market.
     *
     * The fillability reads count too. If they cannot be made, every order is
     * held back as unverified, and an empty grid would be a lie about the
     * market rather than a fact about it.
     */
    logsUnavailable: (error !== null && error !== undefined) || fillChecksFailed,
  };
}

const sameAddress = (a: Address | undefined, b: Address | undefined) =>
  a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

/**
 * Live listings, newest first, optionally narrowed to one collection.
 *
 * `enabled` exists for callers that want the rest of their page on screen
 * first. The scan is a log walk of the whole order book — measured at 16
 * `eth_getLogs` in one batch — and a page that does not show a price has no
 * reason to pay for it before it has shown anything at all.
 */
export function useSeaportListings(collection?: Address, enabled = true) {
  const { orders, isLoading, logsUnavailable } = useSeaportOrders(enabled);

  const listings = useMemo(
    () =>
      orders
        .filter((o) => o.kind === "listing" && o.fillable)
        .filter((o) => collection === undefined || sameAddress(o.collection, collection))
        .sort((a, b) => Number(b.blockNumber - a.blockNumber)),
    [orders, collection],
  );

  return { listings, isLoading, logsUnavailable };
}

/**
 * Tokens that were listed and no longer exist, keyed `collection-tokenId`.
 *
 * Free. Every standing order already has `ownerOf` read for it on each poll to
 * decide whether it can be filled; this is the orders where that read reverted,
 * which for a token somebody published a listing for means it has been burned.
 * No scan of Transfer logs, no tracking of burns — only the tokens the order
 * book is already asking about.
 *
 * `useSeaportOrders` rather than `useSeaportListings`, deliberately: the
 * listings view keeps only what is *fillable*, which is precisely what these
 * are not.
 *
 * What it cannot cover: a token whose listing has aged out of the scan window,
 * or was cancelled. Nothing asks about those any more, so nothing knows. That
 * is the honest edge of a free answer — finding it for an arbitrary old row
 * would cost a read.
 */
export function useBurnedListedTokens(enabled = false) {
  /**
   * Defaults to OFF, and that is the whole point of the default.
   *
   * React Query's `enabled: false` stops a query fetching; it does not stop it
   * reading what is already cached. So this reports the order book wherever a
   * page has mounted one — the collection page and the token page both do,
   * for their prices — and reports nothing where none exists rather than
   * starting a log scan of its own.
   *
   * That distinction is the difference between free and not. `/activity`
   * mounts no order book at all, and defaulting this to `true` would have put
   * a ~34-request scan on a page that had never paid for one, to add a word to
   * a row. A missing mark is a better trade than that.
   */
  const { orders, isLoading } = useSeaportOrders(enabled);

  const burned = useMemo(() => {
    const out = new Set<string>();
    for (const o of orders) {
      if (o.kind !== "listing" || o.unfillable !== "gone" || o.tokenId === undefined) continue;
      out.add(`${o.collection.toLowerCase()}-${o.tokenId}`);
    }
    return out;
  }, [orders]);

  return { burned, isLoading };
}

/**
 * The best live listing per token, keyed `collection-tokenId`.
 *
 * Nothing stops one token carrying several standing listings - a seller can
 * validate as many as they like, and each is independently fillable. The buyer
 * should always be shown the cheapest.
 */
export function useBestListings(collection?: Address, enabled = true) {
  const { listings, isLoading, logsUnavailable } = useSeaportListings(collection, enabled);

  const best = useMemo(() => {
    const map = new Map<string, SeaportOrder>();
    for (const l of listings) {
      if (l.tokenId === undefined) continue;
      const key = `${l.collection.toLowerCase()}-${l.tokenId}`;
      const current = map.get(key);
      if (current === undefined || l.priceWei < current.priceWei) map.set(key, l);
    }
    return map;
  }, [listings]);

  return { best, isLoading, logsUnavailable };
}

/**
 * The cheapest live listing for one token, if it has one.
 *
 * Shares the same scan as every other listing view, so a token page costs no
 * extra RPC work beyond what the market page already did.
 */
export function useListingFor(collection: Address | undefined, tokenId: bigint | undefined) {
  const { best, isLoading, logsUnavailable } = useBestListings(collection);

  const listing = useMemo(() => {
    if (collection === undefined || tokenId === undefined) return undefined;
    return best.get(`${collection.toLowerCase()}-${tokenId}`);
  }, [best, collection, tokenId]);

  return { listing, isLoading, logsUnavailable };
}

/**
 * Offers a given token could accept: bids naming it, plus collection-wide bids.
 *
 * Both kinds belong in one list because from the holder's side they are the same
 * thing - money they can take right now. Keeping them apart is what made a
 * collection offer look unacceptable on every token's page.
 */
export function useOffersForToken(collection: Address | undefined, tokenId: bigint | undefined) {
  const { orders, isLoading, logsUnavailable } = useSeaportOrders();

  const offers = useMemo(
    () =>
      orders
        .filter((o) => o.kind === "offer" && o.fillable)
        .filter((o) => sameAddress(o.collection, collection))
        .filter((o) => o.tokenId === undefined || (tokenId !== undefined && o.tokenId === tokenId))
        .sort((a, b) => (b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0)),
    [orders, collection, tokenId],
  );

  return { offers, best: offers[0], isLoading, logsUnavailable };
}

/** Every live offer on a collection, whichever token they name. */
export function useCollectionOffers(collection: Address | undefined) {
  const { orders, isLoading, logsUnavailable } = useSeaportOrders();

  const offers = useMemo(
    () =>
      orders
        .filter((o) => o.kind === "offer" && o.fillable)
        .filter((o) => sameAddress(o.collection, collection))
        .sort((a, b) => (b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0)),
    [orders, collection],
  );

  return { offers, best: offers[0], isLoading, logsUnavailable };
}

/**
 * What this account has already committed in WSOSO across its standing bids.
 *
 * Needed because allowances are now exact rather than unlimited. An approval
 * covering only the bid being placed would silently under-cover the bids already
 * standing, and they would quietly stop being acceptable. So every approval asks
 * for this plus whatever the current action needs.
 *
 * Counts unfillable orders too: one that is under-allowanced today becomes
 * fillable the moment the allowance is topped up, so it is still exposure.
 */
export function useOwnOfferExposure(maker: Address | undefined, currency?: Address) {
  const { orders, traitOffers } = useSeaportOrders();

  return useMemo(() => {
    if (maker === undefined) return 0n;
    /**
     * Trait offers too. The allowance is set to this total, so a bid missing
     * from it is a bid whose cover the next `allow()` silently revokes.
     */
    return [...orders, ...traitOffers]
      .filter((o) => o.kind === "offer")
      .filter((o) => sameAddress(o.maker, maker))
      .filter((o) => currency === undefined || sameAddress(o.currency, currency))
      .reduce((total, o) => total + o.priceWei, 0n);
  }, [orders, traitOffers, maker, currency]);
}

/**
 * Trait offers that apply to one collection, fillable ones only, best first.
 * Each still has to be matched to a set (`useCriteriaSets` / `useTokenCriteria`)
 * before it may be shown — an unrecognised root is shown nowhere.
 */
export function useTraitOffers(collection: Address | undefined) {
  const { traitOffers, isLoading } = useSeaportOrders();

  const offers = useMemo(
    () =>
      traitOffers
        .filter((o) => o.fillable && sameAddress(o.collection, collection))
        .sort((a, b) => (b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0)),
    [traitOffers, collection],
  );

  return { offers, isLoading };
}

/**
 * Orders made by one account - their listings and their standing bids.
 *
 * Unlike every other view here, this one deliberately keeps orders that cannot
 * currently be filled. A seller who accepted a bid on a listed token still has
 * that listing standing on chain, and hiding it would leave them no way to
 * cancel it - while it quietly waits for the token to come back. Each order
 * carries `fillable` so the UI can mark it rather than drop it.
 */
export function useOrdersBy(maker: Address | undefined) {
  const { orders, traitOffers, isLoading, logsUnavailable } = useSeaportOrders();

  return useMemo(() => {
    /** A maker's own trait offers are theirs to see and cancel, recognised or not. */
    const mine = [...orders, ...traitOffers].filter((o) => sameAddress(o.maker, maker));
    return {
      listings: mine.filter((o) => o.kind === "listing"),
      offers: mine.filter((o) => o.kind === "offer"),
      isLoading,
      logsUnavailable,
    };
  }, [orders, traitOffers, maker, isLoading, logsUnavailable]);
}
