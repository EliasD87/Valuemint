"use client";

import { parseAbi } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { TIER_STRIDE, TRENCHES_ADDRESS } from "@/config/trenches";

/**
 * The depth of every Trenches piece a wallet holds right now, read live from
 * the contract (it is ERC721Enumerable, and the depth is written into the
 * token id). What the perk draw counts at its snapshot, shown before it.
 */

const ENUM_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
]);

/** A wallet holds at most one per depth from claiming; more only by buying. Past this, stop reading. */
const MOST = 200;

export function useTrenchesHoldings(address: `0x${string}` | undefined) {
  const enabled = address !== undefined && TRENCHES_ADDRESS !== "";
  const contract = { address: TRENCHES_ADDRESS as `0x${string}`, abi: ENUM_ABI } as const;

  const balance = useReadContract({
    ...contract,
    functionName: "balanceOf",
    args: address === undefined ? undefined : [address],
    query: { enabled, refetchInterval: 30_000 },
  });
  const count = balance.data === undefined ? 0 : Math.min(Number(balance.data), MOST);

  const ids = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      ...contract,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address!, BigInt(i)] as const,
    })),
    query: { enabled: enabled && count > 0, refetchInterval: 30_000 },
  });

  const depths = (ids.data ?? [])
    .filter((r) => r.status === "success")
    .map((r) => Math.floor(Number(r.result as bigint) / TIER_STRIDE))
    .sort((a, b) => b - a);

  const loading = enabled && (balance.isLoading || (count > 0 && ids.isLoading));
  return { loading, depths, count };
}
