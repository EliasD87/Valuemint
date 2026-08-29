"use client";

import { useCallback } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { parseEther, zeroAddress } from "viem";
import { ValueChainCollectionAbi, ValueChainMarketplaceAbi, deployment } from "@/config/contracts";

const NATIVE = zeroAddress;

/**
 * The marketplace actions, and the approval they depend on.
 *
 * Listing is two transactions, not one: the marketplace is non-custodial, so it
 * needs an ERC-721 approval before it can move anything. Hiding that would leave
 * people staring at a wallet prompt they were not told about, so `needsApproval`
 * is exposed and the UI asks for it explicitly.
 */
export function useTrade(collection: `0x${string}` | undefined = deployment.collection) {
  const { address } = useAccount();

  const { data: approvedForAll, refetch: refetchApproval } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "isApprovedForAll",
    args: address === undefined ? undefined : [address, deployment.marketplace],
    query: { enabled: address !== undefined },
  });

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback(() => {
    reset();
    writeContract({
      address: collection,
      abi: ValueChainCollectionAbi,
      functionName: "setApprovalForAll",
      args: [deployment.marketplace, true],
    });
  }, [collection, reset, writeContract]);

  const list = useCallback(
    (tokenId: bigint, priceInSoso: string) => {
      reset();
      writeContract({
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "list",
        // Native SOSO, no expiry: the simplest listing, and the one the UI offers.
        args: [collection, tokenId, NATIVE, parseEther(priceInSoso), 0n],
      });
    },
    [collection, reset, writeContract],
  );

  const cancel = useCallback(
    (tokenId: bigint) => {
      reset();
      writeContract({
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "cancelListing",
        args: [collection, tokenId],
      });
    },
    [collection, reset, writeContract],
  );

  const buy = useCallback(
    (tokenId: bigint, price: bigint) => {
      reset();
      writeContract({
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "buy",
        args: [collection, tokenId],
        value: price,
      });
    },
    [collection, reset, writeContract],
  );

  return {
    needsApproval: approvedForAll === false,
    refetchApproval,
    approve,
    list,
    cancel,
    buy,
    signing,
    confirming,
    busy: signing || confirming,
    isSuccess,
    error,
    reset,
    hash,
  };
}

/** What a sale at this price would pay out, straight from the contract. */
export function usePreviewSale(
  collection: `0x${string}` | undefined,
  tokenId: bigint | undefined,
  priceInSoso: string,
) {
  const price = (() => {
    try {
      return parseEther(priceInSoso || "0");
    } catch {
      return 0n;
    }
  })();

  const { data } = useReadContract({
    address: deployment.marketplace,
    abi: ValueChainMarketplaceAbi,
    functionName: "previewSale",
    args: tokenId === undefined || collection === undefined ? undefined : [collection, tokenId, price],
    query: { enabled: tokenId !== undefined && collection !== undefined && price > 0n },
  });

  const [proceeds, fee, , royalty] = (data ?? [0n, 0n, zeroAddress, 0n]) as [
    bigint,
    bigint,
    string,
    bigint,
  ];

  return { proceeds, fee, royalty, price };
}
