"use client";

import { useCallback } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { ValueChainCollectionAbi, ValueChainCollectionOffersAbi, deployment } from "@/config/contracts";
import { valuechain } from "@/config/chain";
import { COLLECTION_OFFERS_ADDRESS, collectionOffersEnabled } from "@/hooks/useCollectionOffers";

/**
 * Writing to the collection-offers contract: bid on a collection, retract, or
 * sell into someone's bid.
 *
 * Separate from `useTrade` because the approvals are separate. The offers
 * contract is not the marketplace, so a seller who approved the marketplace has
 * approved nothing here — and quietly reusing `useTrade`'s `needsApproval` would
 * show an Accept button that always reverts. That is the cost of adding this
 * beside the marketplace instead of inside it, and the honest thing is to ask
 * for the second approval plainly rather than hide it.
 */

/**
 * How long a new collection offer stands.
 *
 * Shorter than a listing's 90 days on purpose. A collection offer names no
 * token, so a forgotten one is fillable by anybody who ever mints into the
 * collection, out of a wallet that stopped thinking about it months ago. The
 * contract's ceiling is 180 days; this is the default a person gets without
 * choosing.
 */
export const DEFAULT_OFFER_DAYS = 14;

function expiryIn(days: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
}

export function useCollectionOfferTrade(collection: `0x${string}` | undefined) {
  const { address } = useAccount();
  const offersAddress = COLLECTION_OFFERS_ADDRESS as `0x${string}`;
  const ready = collectionOffersEnabled && collection !== undefined;

  const { data: approvedForAll, refetch: refetchApproval } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "isApprovedForAll",
    args: address === undefined ? undefined : [address, offersAddress],
    query: { enabled: address !== undefined && ready },
  });

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  /** Lets the offers contract move a piece when its owner accepts a bid. */
  const approve = useCallback(() => {
    if (!ready) return;
    reset();
    writeContract({
      chainId: valuechain.id,
      address: collection,
      abi: ValueChainCollectionAbi,
      functionName: "setApprovalForAll",
      args: [offersAddress, true],
    });
  }, [collection, offersAddress, ready, reset, writeContract]);

  const makeOffer = useCallback(
    (priceInSoso: string, days: number = DEFAULT_OFFER_DAYS) => {
      if (!ready) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: offersAddress,
        abi: ValueChainCollectionOffersAbi,
        functionName: "makeCollectionOffer",
        // WSOSO, never native: an open offer has to stay collateralised, and an
        // allowance does that without the contract holding anybody's money.
        args: [collection, deployment.wsoso, parseEther(priceInSoso), expiryIn(days)],
      });
    },
    [collection, offersAddress, ready, reset, writeContract],
  );

  const withdrawOffer = useCallback(() => {
    if (!ready) return;
    reset();
    writeContract({
      chainId: valuechain.id,
      address: offersAddress,
      abi: ValueChainCollectionOffersAbi,
      functionName: "withdrawCollectionOffer",
      args: [collection],
    });
  }, [collection, offersAddress, ready, reset, writeContract]);

  /**
   * `tokenId` is the seller's choice, not the bidder's — the offer names no
   * token. `minPrice` and the currency are the slippage guards: a bidder can
   * overwrite their own offer downward in the block before this lands, so the
   * price actually seen is passed back and the contract refuses if it no longer
   * holds.
   */
  const acceptOffer = useCallback(
    (tokenId: bigint, bidder: `0x${string}`, minPrice: bigint) => {
      if (!ready) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: offersAddress,
        abi: ValueChainCollectionOffersAbi,
        functionName: "acceptCollectionOffer",
        args: [collection, tokenId, bidder, minPrice, deployment.wsoso],
      });
    },
    [collection, offersAddress, ready, reset, writeContract],
  );

  return {
    enabled: collectionOffersEnabled,
    needsApproval: approvedForAll === false,
    refetchApproval,
    approve,
    makeOffer,
    withdrawOffer,
    acceptOffer,
    signing,
    confirming,
    busy: signing || confirming,
    isSuccess,
    error,
    reset,
    hash,
  };
}
