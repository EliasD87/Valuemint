"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { useWriteContract } from "@/hooks/useChainWrite";
import { useQueryClient } from "@tanstack/react-query";
import { useTxOutcome } from "@/hooks/useTxOutcome";
import { parseEther, zeroHash, type Address } from "viem";
import { ValueChainCollectionAbi } from "@/config/contracts";
import { rememberValidatedOrders } from "@/lib/pendingOrders";
import { SEAPORT, SeaportAbi } from "@/config/seaport";
import { classifyFillFailure, type FillBlock } from "@/lib/fillCheck";
import { valuechain } from "@/config/chain";
import { useVerifiedContracts } from "@/hooks/useVerifiedContracts";
import {
  CONDUIT_KEY,
  DEFAULT_ORDER_DAYS,
  ItemType,
  buildListing,
  buildOffer,
  lotPrice,
  toComponents,
  asOrder,
  toWire,
  type OrderParameters,
} from "@/lib/seaport";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";

/**
 * Trading through Seaport: list, buy, bid, accept, cancel.
 *
 * Every write passes `chainId` explicitly. wagmi is configured with
 * `chains: [valuechain]` so a write elsewhere already fails, but that guarantee
 * lives in wagmi's internals rather than in this file, and the failure mode if
 * it ever stopped holding is not a revert: `buy` sends `value`, and on a chain
 * where Seaport's address has no code that call succeeds as a plain transfer to
 * an address nobody controls. Silent loss, not an error. With `chainId` given,
 * wagmi asserts the connector's chain and throws `ChainMismatchError` instead.
 *
 * There is no backend here and no signature step. `validate()` writes the order
 * to the chain, which costs gas the signature route would not - but it buys an
 * order book that cannot be lost, taken down, or quietly filtered, and it is the
 * only honest option without a server to keep signed orders in.
 */

const ZERO_SIGNATURE = "0x" as const;

const asAdvanced = (params: OrderParameters, numerator = 1n, denominator = 1n) => ({
  parameters: toWire(params),
  numerator,
  denominator,
  signature: ZERO_SIGNATURE,
  extraData: ZERO_SIGNATURE,
});

/**
 * Where the criteria item sits in an order's consideration.
 *
 * Our own offers always put it first, but an order built by anything else need
 * not, and a resolver pointing at the wrong index is rejected by Seaport rather
 * than misapplied. Finding it is three lines; assuming it is a bug waiting for
 * the first order this app did not create.
 */
function criteriaIndex(params: OrderParameters): number {
  return params.consideration.findIndex(
    (c) =>
      c.itemType === ItemType.ERC721_WITH_CRITERIA || c.itemType === ItemType.ERC1155_WITH_CRITERIA,
  );
}

/**
 * The seller's and bidder's side of trading one collection.
 *
 * `collection` is required and has no default. `useTrade` defaulted it to the
 * Genesis address, which meant a call site that forgot to pass one did not fail
 * - it silently traded against the wrong contract.
 */
export function useSeaportTrade(collection: Address | undefined) {
  const { address } = useAccount();

  /**
   * Seaport is approved directly rather than through a conduit, so this is the
   * one approval a seller ever grants, and it covers every order they make for
   * this collection.
   */
  const { data: approvedForAll, refetch: refetchApproval } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "isApprovedForAll",
    args: address === undefined ? undefined : [address, SEAPORT],
    query: { enabled: address !== undefined && collection !== undefined },
  });

  /**
   * The maker's counter, needed to cancel.
   *
   * An order's hash is derived from its parameters *and* this number, so a
   * cancel built with a stale counter addresses an order that was never
   * validated - Seaport accepts the call and nothing happens. Read live rather
   * than remembered.
   */
  const { data: counter, refetch: refetchCounter } = useReadContract({
    address: SEAPORT,
    abi: SeaportAbi,
    functionName: "getCounter",
    args: address === undefined ? undefined : [address],
    query: { enabled: address !== undefined },
  });

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess, data: receipt } = useTxOutcome({ hash });

  /**
   * Hold on to whatever this transaction just validated.
   *
   * Everything this hook writes — a listing, an offer, fifty listings at once —
   * reaches the order book the same way: Seaport emits `OrderValidated` and a
   * log scan finds it later. Later is the problem. That scan stops six
   * confirmations behind the head and polls every thirty seconds, so an offer
   * somebody has just paid for is absent from their own screen for the better
   * part of a minute, and reloading was the only thing that appeared to help.
   *
   * The receipt already contains the order. Reading it here means the person
   * who placed it sees it immediately, from the same bytes the scan will
   * report, while everyone else waits for the chain as they should.
   */
  useEffect(() => {
    if (isSuccess) rememberValidatedOrders(receipt);
  }, [isSuccess, receipt]);

  /**
   * The identity check gates this one write specifically.
   *
   * `setApprovalForAll` is the most consequential thing this app ever asks for:
   * blanket operator rights over every token the wallet holds in a collection,
   * for as long as it holds them. If `SEAPORT` is not the contract this build
   * believes it is, that grant goes to whoever the wrong literal names — and it
   * is not recoverable by noticing afterwards.
   *
   * Refusing to *send* is the right response rather than warning, because a
   * warning is dismissible and this is not a judgement call: the chain has
   * already said the address is wrong.
   */
  const identity = useVerifiedContracts();

  const approve = useCallback(() => {
    if (collection === undefined) return;
    if (identity.mismatch) return;
    reset();
    writeContract({
      chainId: valuechain.id,
      address: collection,
      abi: ValueChainCollectionAbi,
      functionName: "setApprovalForAll",
      args: [SEAPORT, true],
    });
  }, [collection, identity.mismatch, reset, writeContract]);

  const list = useCallback(
    (tokenId: bigint, priceInSoso: string, days: number = DEFAULT_ORDER_DAYS) => {
      if (collection === undefined || address === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "validate",
        args: [
          [
            asOrder(
              buildListing({
                seller: address,
                collection,
                tokenId,
                priceWei: parseEther(priceInSoso),
                days,
              }),
            ),
          ],
        ],
      });
    },
    [address, collection, reset, writeContract],
  );

  /**
   * List a quantity of an ERC-1155 id at a price **per unit**.
   *
   * Seaport prices the lot, not the unit — an order says "these 10 tokens for
   * this much money" — so the unit price is multiplied up here, in one place.
   * The conversion has to happen somewhere and this is the only safe end of it:
   * the UI asks for a price "each", and passing that straight through as the
   * order total would list ten editions for the price of one, silently, with
   * nothing on screen disagreeing until somebody bought the lot for a tenth of
   * what the seller meant.
   *
   * Partial fills keep the unit price intact: Seaport takes the same fraction of
   * the money as of the tokens.
   */
  const listMulti = useCallback(
    (tokenId: bigint, amount: bigint, unitPriceInSoso: string, days: number = DEFAULT_ORDER_DAYS) => {
      if (collection === undefined || address === undefined || amount <= 0n) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "validate",
        args: [
          [
            asOrder(
              buildListing({
                seller: address,
                collection,
                tokenId,
                amount,
                priceWei: lotPrice(parseEther(unitPriceInSoso), amount),
                days,
              }),
            ),
          ],
        ],
      });
    },
    [address, collection, reset, writeContract],
  );

  /**
   * Bid. Leave `tokenId` out for a collection offer any holder can accept.
   *
   * The money never leaves the bidder's wallet: this writes an order, and the
   * WSOSO moves only when somebody fills it.
   */
  const makeOffer = useCallback(
    (tokenId: bigint | undefined, priceInSoso: string, days: number = DEFAULT_ORDER_DAYS) => {
      if (collection === undefined || address === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "validate",
        args: [
          [
            asOrder(
              buildOffer({
                bidder: address,
                collection,
                tokenId,
                priceWei: parseEther(priceInSoso),
                days,
              }),
            ),
          ],
        ],
      });
    },
    [address, collection, reset, writeContract],
  );

  /**
   * Withdraw one order, listing or bid.
   *
   * Takes the whole order rather than a token id, because Seaport cancels by
   * hash and the hash needs every field back. That is why the feed keeps the
   * parameters, not just a summary.
   */
  const cancelOrder = useCallback(
    (order: SeaportOrder) => {
      if (counter === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "cancel",
        args: [[toComponents(toWire(order.params), counter as bigint)]],
      });
    },
    [counter, reset, writeContract],
  );

  /**
   * Void everything this account has standing, in one transaction.
   *
   * Worth exposing on its own: it is the only action that does not need to know
   * what the orders were, which makes it the right button for "I have no idea
   * what I have listed and I want it all gone".
   */
  const cancelAll = useCallback(() => {
    reset();
    writeContract({
      chainId: valuechain.id,
      address: SEAPORT,
      abi: SeaportAbi,
      functionName: "incrementCounter",
    });
  }, [reset, writeContract]);

  return {
    /** The chain disagrees with this build about Seaport or WSOSO. */
    contractsMismatch: identity.mismatch,
    needsApproval: approvedForAll === false,
    refetchApproval,
    refetchCounter,
    counter: counter as bigint | undefined,
    approve,
    list,
    listMulti,
    makeOffer,
    cancelOrder,
    cancelAll,
    signing,
    confirming,
    busy: signing || confirming,
    isSuccess,
    error,
    reset,
    hash,
  };
}

/**
 * A fill, as both the simulation and the write take it.
 *
 * Written out rather than derived from wagmi, whose inferred argument type is a
 * union over every function in Seaport's ABI and cannot be spread.
 */
interface FillRequest {
  chainId: number;
  address: Address;
  abi: typeof SeaportAbi;
  functionName: "fulfillOrder" | "fulfillAdvancedOrder";
  args: readonly unknown[];
  value?: bigint;
}

/**
 * The taking side: buying a listing, and accepting a bid.
 *
 * Separate from `useSeaportTrade` because it is not scoped to a collection - the
 * order carries its own - and because the two have different approval stories. A
 * buyer needs nothing; somebody accepting a bid needs both an NFT approval and a
 * WSOSO allowance for the fee.
 */
export function useSeaportFill() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useTxOutcome({ hash });

  /**
   * Why the last attempt did not reach the wallet, if it did not.
   *
   * Separate from `error`, which is a *transaction* that failed. This is a
   * transaction that was never sent, and the difference matters to the person
   * reading it: one costs gas and the other does not, and telling them so is
   * most of the value of checking at all.
   */
  const [blocked, setBlocked] = useState<FillBlock | undefined>(undefined);

  /** True while the order is being checked against the chain, before signing. */
  const [checking, setChecking] = useState(false);

  const queryClient = useQueryClient();

  /**
   * A refusal means the book on screen is out of date. Re-read it here rather
   * than in each page, or the surfaces that forgot would go on offering the
   * order that was just refused.
   */
  const refreshBook = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["indexed-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["seaport-validated"] });
  }, [queryClient]);

  /**
   * Ask the chain whether this would work, then sign only if it would.
   *
   * One `eth_call` against current state, which is the same thing the
   * transaction is about to do — so it catches every way an order can have
   * retired, including the counter increment that leaves an order reporting
   * itself validated while being unreachable. Reassembling those checks by hand
   * would be several reads and would still miss whatever Seaport adds next.
   *
   * A failure this does NOT recognise is not a reason to refuse: the simulation
   * runs against one node's view, which can lag, and blocking a buy that would
   * have worked is worse than the problem. See `classifyFillFailure`.
   */
  const send = useCallback(
    async (request: FillRequest) => {
      reset();
      setBlocked(undefined);

      if (client !== undefined && address !== undefined) {
        setChecking(true);
        try {
          await client.simulateContract({ ...request, account: address } as never);
        } catch (err) {
          const why = classifyFillFailure(err instanceof Error ? err.message : String(err));
          if (why !== undefined) {
            setBlocked(why);
            setChecking(false);
            refreshBook();
            return;
          }
          // Unrecognised: let the wallet and the person decide, as before.
        } finally {
          setChecking(false);
        }
      }

      /**
       * One cast, at the boundary, and only here.
       *
       * wagmi infers `writeContract`'s argument from the ABI and the function
       * name together, which is exactly what makes it useless as a parameter
       * type: the union across every function on Seaport's ABI cannot be spread
       * or built up. The shape is checked by `FillRequest` on the way in, and
       * by Seaport on the way out.
       */
      writeContract(request as never);
    },
    [address, client, refreshBook, reset, writeContract],
  );

  /**
   * Buy a listing at the price shown.
   *
   * `value` is the order's own total, so there is no separate slippage guard to
   * get wrong: if the order were different from the one on screen its hash would
   * differ, and Seaport would find nothing validated to fill. The previous
   * marketplace needed `maxPrice` and `expectedPaymentToken` precisely because
   * its listings were mutable in place.
   */
  const buy = useCallback(
    (order: SeaportOrder) => {
      void send({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "fulfillOrder",
        args: [asOrder(order.params), CONDUIT_KEY],
        value: order.priceWei,
      });
    },
    [send],
  );

  /** Take part of an ERC-1155 listing: `units` of the order's total `amount`. */
  const buyPartial = useCallback(
    (order: SeaportOrder, units: bigint) => {
      if (address === undefined || order.amount === 0n) return;
      void send({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "fulfillAdvancedOrder",
        args: [asAdvanced(order.params, units, order.amount), [], CONDUIT_KEY, address],
        /**
         * Seaport rounds a partial fill's consideration up, never down, so
         * paying the exact fraction can underpay by a wei. The order's own total
         * is the ceiling the buyer already agreed to and any excess native value
         * is returned, so send the fraction rounded up.
         */
        value: (order.priceWei * units + order.amount - 1n) / order.amount,
      });
    },
    [address, send],
  );

  /**
   * Accept a bid, handing over `tokenId`.
   *
   * A bid naming one token is a plain fill. A collection-wide bid names none, so
   * the holder says which token they are selling through a criteria resolver -
   * with `identifierOrCriteria` zero meaning any token, the proof is empty and
   * the identifier alone is the answer.
   */
  const acceptOffer = useCallback(
    (order: SeaportOrder, tokenId: bigint) => {
      if (address === undefined) return;

      if (order.tokenId !== undefined) {
        /**
         * The caller named a token; the order names one too. They must agree.
         *
         * Seaport settles the order's own identifier regardless of what we pass,
         * so nothing mis-settles today — the argument was simply discarded. But
         * a caller that believes it chose which piece to sell, and silently did
         * not, is a bug waiting for the first surface that offers a picker.
         * Refuse rather than quietly ignore.
         */
        if (order.tokenId !== tokenId) return;

        void send({
          chainId: valuechain.id,
          address: SEAPORT,
          abi: SeaportAbi,
          functionName: "fulfillOrder",
          args: [asOrder(order.params), CONDUIT_KEY],
        });
        return;
      }

      const index = criteriaIndex(order.params);
      if (index < 0) return;

      void send({
        chainId: valuechain.id,
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "fulfillAdvancedOrder",
        args: [
          asAdvanced(order.params),
          [
            {
              orderIndex: 0n,
              side: 1, // consideration
              index: BigInt(index),
              identifier: tokenId,
              criteriaProof: [] as readonly `0x${string}`[],
            },
          ],
          CONDUIT_KEY,
          address,
        ],
      });
    },
    [address, send],
  );

  return {
    buy,
    buyPartial,
    acceptOffer,
    signing,
    confirming,
    /**
     * Why nothing was sent, when nothing was sent.
     *
     * Distinct from `error`: that is a transaction that failed and cost gas;
     * this is one that never left, and the person deserves to know which.
     */
    blocked,
    clearBlocked: () => setBlocked(undefined),
    checking,
    busy: signing || confirming || checking,
    isSuccess,
    error,
    reset,
    hash,
  };
}

/** Seaport is the spender for every WSOSO allowance this app needs. */
export const WSOSO_SPENDER = SEAPORT;

export { zeroHash as NO_CONDUIT };
