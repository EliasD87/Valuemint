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
  type SeaportOrder,
  resolveFillable,
} from "@/lib/seaport";

export type { SeaportOrder } from "@/lib/seaport";

/**
 * Every live Seaport order, read from the chain and nothing else.
 *
 * This is the piece that makes the marketplace serverless. Orders are put on
 * chain with `validate()`, and Seaport's `OrderValidated` event carries the
 * *entire* order - not a hash, not a pointer, the full parameters. So the order
 * book is reconstructible by anyone with an RPC endpoint, and there is no
 * database that can lose an order, censor one, or go down and take the market
 * with it.
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

/**
 * The most orders one visitor will read the status of.
 *
 * Each surviving candidate costs one `getOrderStatus` plus two fillability
 * reads, batched through multicall3 but real work all the same. 2,000 is far
 * beyond any honest volume this marketplace has seen — the entire order book is
 * currently six events — and small enough that a flood degrades the oldest
 * entries rather than the whole page.
 */
const MAX_CANDIDATE_ORDERS = 2_000;

/**
 * The most orders any one address may occupy in the candidate set.
 *
 * Chosen so the cap cannot be exhausted by a handful of addresses: at 200, it
 * takes ten distinct offerers to fill the book, and each one costs a funded
 * wallet rather than an array element. No honest maker on this marketplace has
 * ever held more than a few dozen live orders.
 */
const MAX_ORDERS_PER_OFFERER = 200;

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
       * Capping displaces the flood into itself rather than into the whole
       * book: a spammer buries their own orders, not everyone's. Newest-first
       * because a genuine order is far more likely to be recent, and because an
       * old order that survives is still reachable from its token's own page.
       *
       * This is a ceiling, not the answer. The structural fix is a cached read
       * path — one scan serving every visitor — and this keeps the failure
       * graceful until that exists.
       */
      /**
       * Newest first, but no single offerer may take the whole book.
       *
       * The global cap alone was the wrong shape of defence. Sorting newest
       * first and slicing from the front means new orders evict old ones, so
       * `validate(Order[])` — which takes an array — let one cheap transaction
       * publish `MAX_CANDIDATE_ORDERS` shaped-but-worthless orders and displace
       * every genuine listing and bid on the chain, refreshed every 30s.
       *
       * The second-order effect was worse than the empty market: with a
       * bidder's own standing bids evicted, `useOwnOfferExposure` returns 0n,
       * so the next `allow()` sets the WSOSO allowance to just the bid being
       * placed — silently revoking the cover for bids already on chain, which
       * is the exact failure `alsoCover` exists to prevent.
       *
       * A per-offerer quota bounds one address to its share, so a flood
       * displaces itself rather than everyone. It is not the structural answer
       * — that is a cached read path serving every visitor — but it makes the
       * cheap attack cost an address per slot instead of a transaction.
       */
      const newestFirst = [...byHash.values()].sort((a, b) =>
        Number(b.blockNumber - a.blockNumber),
      );

      const perOfferer = new Map<string, number>();
      const candidates: typeof newestFirst = [];

      for (const c of newestFirst) {
        if (candidates.length >= MAX_CANDIDATE_ORDERS) break;
        const maker = c.read.maker.toLowerCase();
        const taken = perOfferer.get(maker) ?? 0;
        if (taken >= MAX_ORDERS_PER_OFFERER) continue;
        perOfferer.set(maker, taken + 1);
        candidates.push(c);
      }

      if (byHash.size > MAX_CANDIDATE_ORDERS) {
        console.warn(
          `[order book] ${byHash.size} validated orders in range; showing the newest ${MAX_CANDIDATE_ORDERS}.`,
        );
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
  const { data, isLoading: scanning, error } = useValidatedOrders(enabled);

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

  const orders = useMemo<SeaportOrder[]>(
    () =>
      standing.map((o, i) => {
        /**
         * Three states, not two: not checked yet, checked and refused, checked
         * and answered. `resolveFillable` in `lib/seaport.ts` is the rule and
         * carries the reasoning and the tests; the one thing worth repeating
         * here is that "not checked yet" is NOT fillable, and `isLoading` below
         * is what keeps that from reading as an empty market.
         */
        return {
          ...o,
          fillable: resolveFillable(
            o,
            fillChecks === undefined
              ? undefined
              : { first: fillChecks[i * 2], second: fillChecks[i * 2 + 1] },
          ),
        };
      }),
    [standing, fillChecks],
  );

  return {
    orders,
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
  const { orders } = useSeaportOrders();

  return useMemo(() => {
    if (maker === undefined) return 0n;
    return orders
      .filter((o) => o.kind === "offer")
      .filter((o) => sameAddress(o.maker, maker))
      .filter((o) => currency === undefined || sameAddress(o.currency, currency))
      .reduce((total, o) => total + o.priceWei, 0n);
  }, [orders, maker, currency]);
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
  const { orders, isLoading, logsUnavailable } = useSeaportOrders();

  return useMemo(() => {
    const mine = orders.filter((o) => sameAddress(o.maker, maker));
    return {
      listings: mine.filter((o) => o.kind === "listing"),
      offers: mine.filter((o) => o.kind === "offer"),
      isLoading,
      logsUnavailable,
    };
  }, [orders, maker, isLoading, logsUnavailable]);
}
