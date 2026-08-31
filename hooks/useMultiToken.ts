"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { scanLogs, FROM_BLOCK } from "@/lib/logScan";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";

/**
 * Reading one ERC-1155 id: who is selling it, at what, and how many you hold.
 *
 * The awkward part of ERC-1155 for a marketplace is that there is no owner to
 * ask about. ERC-721 has `ownerOf`, so one call answers "is this listed and by
 * whom". A 1155 id can be held by any number of wallets at once and any of them
 * can be selling, so the set of sellers is not derivable from the token
 * contract at all - it only exists as marketplace events.
 *
 * Hence the log scan. `MultiListed` gives the candidate sellers; the contract
 * then confirms which of those listings are still real. There is no indexer
 * here, so this is the honest way to do it, and it is why the result is cached
 * rather than polled hard.
 */

const multiListedEvent = parseAbiItem(
  "event MultiListed(address indexed collection, uint256 indexed tokenId, address indexed seller, address paymentToken, uint256 unitPrice, uint256 amount, uint64 expiry)",
);

export interface MultiListing {
  seller: `0x${string}`;
  unitPrice: bigint;
  amount: bigint;
  expiry: bigint;
}

export function useMultiListings(collection: `0x${string}` | undefined, tokenId: bigint | undefined) {
  const client = usePublicClient();

  const sellersQuery = useQuery({
    queryKey: ["multiSellers", collection, tokenId?.toString()],
    enabled: client !== undefined && collection !== undefined && tokenId !== undefined,
    // Listings change on a human timescale, and each refetch is a full log scan.
    staleTime: 30_000,
    queryFn: async () => {
      const logs = await scanLogs(client!, {
        address: deployment.marketplace,
        event: multiListedEvent,
        args: { collection, tokenId },
        fromBlock: FROM_BLOCK,
      });
      // Newest first, de-duplicated: a seller who re-lists appears twice.
      const seen = new Set<string>();
      const sellers: `0x${string}`[] = [];
      for (let i = logs.length - 1; i >= 0; i--) {
        const s = (logs[i]!.args as { seller?: `0x${string}` }).seller;
        if (s === undefined || seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        sellers.push(s);
      }
      return sellers;
    },
  });

  const sellers = sellersQuery.data ?? [];

  // The events only say who *has* listed. The contract says who still is.
  const { data, refetch } = useReadContracts({
    contracts: sellers.map((seller) => ({
      address: deployment.marketplace,
      abi: ValueChainMarketplaceAbi,
      functionName: "getMultiListing" as const,
      args: [collection, tokenId, seller] as const,
    })),
    query: { enabled: sellers.length > 0, refetchInterval: 15_000 },
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const listings: MultiListing[] = [];
  data?.forEach((r, i) => {
    if (r.status !== "success") return;
    const l = r.result as unknown as {
      unitPrice: bigint;
      amount: bigint;
      expiry: bigint;
    };
    if (l.amount === 0n) return;
    if (l.expiry !== 0n && l.expiry <= now) return;
    listings.push({ seller: sellers[i]!, unitPrice: l.unitPrice, amount: l.amount, expiry: l.expiry });
  });

  // Cheapest first — the only ordering that makes sense when several wallets
  // are selling the same thing.
  listings.sort((a, b) => (a.unitPrice < b.unitPrice ? -1 : a.unitPrice > b.unitPrice ? 1 : 0));

  return {
    listings,
    isLoading: sellersQuery.isLoading,
    refetch: () => {
      void sellersQuery.refetch();
      void refetch();
    },
  };
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
    args: address === undefined ? undefined : [address, deployment.marketplace],
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
