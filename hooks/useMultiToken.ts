"use client";

import { useEffect, useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { SEAPORT } from "@/config/seaport";
import { useSeaportListings, type SeaportOrder } from "@/hooks/useSeaportOrders";
import { unitPrice } from "@/lib/seaport";

/**
 * Reading one ERC-1155 id: who is selling it, at what, and how many you hold.
 *
 * The awkward part of ERC-1155 for a marketplace is that there is no owner to
 * ask about. ERC-721 has `ownerOf`, so one call answers "is this listed and by
 * whom". A 1155 id can be held by any number of wallets at once and any of them
 * can be selling, so the set of sellers is not derivable from the token
 * contract at all - it only exists as marketplace events.
 *
 * Under Seaport this costs nothing extra. Each seller simply has their own
 * order, and they are all in the same `OrderValidated` scan every other view
 * already runs - so what used to be a dedicated log scan plus a confirming
 * contract call per seller is now a filter over data in memory.
 *
 * The previous marketplace needed both because it kept 1155 listings in a map
 * keyed by seller as well as id, and events alone could not say which of them
 * were still real.
 */

export interface MultiListing {
  seller: `0x${string}`;
  unitPrice: bigint;
  amount: bigint;
  expiry: bigint;
  /** The order behind it - buying or cancelling needs the whole thing. */
  order: SeaportOrder;
}

export function useMultiListings(collection: `0x${string}` | undefined, tokenId: bigint | undefined) {
  const { listings: all, isLoading, logsUnavailable } = useSeaportListings(collection);

  const listings = useMemo<MultiListing[]>(() => {
    if (tokenId === undefined) return [];

    const rows = all
      .filter((o) => o.tokenId === tokenId && o.amount > 0n)
      .map((order) => ({
        seller: order.maker,
        /**
         * Seaport prices the lot, not the unit. Dividing here keeps several
         * wallets selling the same edition comparable, which is the only thing
         * anyone wants from this list.
         */
        unitPrice: unitPrice(order.priceWei, order.amount),
        /** What is left after any partial fills. */
        amount: order.size > 0n ? order.amount - (order.amount * order.filled) / order.size : order.amount,
        expiry: order.endTime,
        order,
      }))
      .filter((l) => l.amount > 0n);

    // Cheapest first - the only ordering that makes sense when several wallets
    // are selling the same thing.
    return rows.sort((a, b) => (a.unitPrice < b.unitPrice ? -1 : a.unitPrice > b.unitPrice ? 1 : 0));
  }, [all, tokenId]);

  return {
    listings,
    isLoading,
    /** The scan polls itself; kept so callers do not have to change shape. */
    refetch: () => undefined, logsUnavailable };
}

const balanceOfAbi = [
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
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** How many of this id the connected wallet holds, and whether it has approved. */
export function useMultiBalance(collection: `0x${string}` | undefined, tokenId: bigint | undefined) {
  const { address } = useAccount();

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: collection,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: address === undefined || tokenId === undefined ? undefined : [address, tokenId],
    query: { enabled: address !== undefined && collection !== undefined && tokenId !== undefined },
  });

  const { data: approved, refetch: refetchApproval } = useReadContract({
    address: collection,
    abi: balanceOfAbi,
    functionName: "isApprovedForAll",
    args: address === undefined ? undefined : [address, SEAPORT],
    query: { enabled: address !== undefined && collection !== undefined },
  });

  return {
    balance: (balance as bigint | undefined) ?? 0n,
    /**
     * ERC-1155 has no per-token approval, only operator approval — so unlike the
     * ERC-721 path there is no `getApproved` fallback to check.
     */
    needsApproval: approved === false,
    refetch: () => {
      void refetchBalance();
      void refetchApproval();
    },
  };
}

/** Re-read on a receipt, never on a click. See the note in TokenView. */
export function useRefetchOnSuccess(isSuccess: boolean, hash: string | undefined, fn: () => void) {
  useEffect(() => {
    if (isSuccess) fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, hash]);
}
