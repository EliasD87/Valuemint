"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { erc721Abi } from "viem";
import { ERC721_INTERFACE_ID, erc165Abi } from "@/config/erc721";
import { deployment } from "@/config/contracts";
import { isHidden } from "@/config/hidden";

/**
 * Finds every NFT collection on ValueChain, not only the ones made here.
 *
 * The marketplace contract trades any ERC-721 — `list()` takes a collection
 * address — so restricting the interface to collections from our own factory
 * would hide tradeable work for no reason. The chain has no indexing service, but
 * Blockscout's REST API already enumerates tokens by type, which is discovery
 * enough and costs us nothing to run.
 *
 * ERC-1155 collections are included now that the marketplace has `listMulti`
 * and `buyMulti`. They were excluded while it was ERC-721 only, for the good
 * reason that showing one would have produced a buy button that always
 * reverted; the standard is carried through on each result so the UI can pick
 * the right path rather than guessing from the address.
 *
 * Both types are fetched in parallel and merged. Blockscout returns them from
 * separate queries - there is no combined endpoint - and a failure of either
 * should not blank the other, so the results are settled independently.
 */

export interface DiscoveredCollection {
  address: `0x${string}`;
  name: string;
  symbol: string;
  totalSupply?: string;
  holders?: number;
  /** True when this collection came out of our factory. */
  fromFactory?: boolean;
  /**
   * Which standard the explorer says it speaks. The UI still confirms this on
   * chain through `useTokenStandard` before offering a trade button - the
   * explorer is an index, not an authority, and it is the one place here that
   * is neither our code nor the chain.
   */
  standard?: "erc721" | "erc1155";
}

interface BlockscoutToken {
  address_hash?: string;
  address?: string;
  name?: string;
  symbol?: string;
  total_supply?: string;
  holders_count?: string;
  holders?: string;
}

async function fetchByType(type: "ERC-721" | "ERC-1155"): Promise<BlockscoutToken[]> {
  const res = await fetch(`${deployment.explorer}/api/v2/tokens?type=${type}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Explorer returned ${res.status}`);
  const body = (await res.json()) as { items?: BlockscoutToken[] };
  return body.items ?? [];
}

export function useDiscoveredCollections() {
  return useQuery({
    queryKey: ["discovered-collections"],
    staleTime: 60_000,
    queryFn: async (): Promise<DiscoveredCollection[]> => {
      // Settled rather than `all`: one type failing should not blank the other.
      const [single, multi] = await Promise.allSettled([
        fetchByType("ERC-721"),
        fetchByType("ERC-1155"),
      ]);
      if (single.status === "rejected" && multi.status === "rejected") {
        throw single.reason as Error;
      }

      const tagged: Array<BlockscoutToken & { standard: "erc721" | "erc1155" }> = [
        ...(single.status === "fulfilled" ? single.value : []).map((t) => ({
          ...t,
          standard: "erc721" as const,
        })),
        ...(multi.status === "fulfilled" ? multi.value : []).map((t) => ({
          ...t,
          standard: "erc1155" as const,
        })),
      ];

      return tagged
        .map((t) => {
          const address = (t.address_hash ?? t.address ?? "") as `0x${string}`;
          return {
            address,
            name: t.name ?? "Untitled collection",
            symbol: t.symbol ?? "",
            totalSupply: t.total_supply,
            holders: Number(t.holders_count ?? t.holders ?? 0),
            standard: t.standard,
          };
        })
        .filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.address) && !isHidden(c.address));
    },
  });
}

/**
 * Checks that an arbitrary address really is a tradeable ERC-721.
 *
 * The explorer only knows about contracts it has indexed, and its NFT crawler has
 * been slow on this chain, so anything it misses would otherwise be untradeable
 * through this interface. Pasting an address falls back to asking the contract
 * itself, which is the authoritative answer either way.
 */
export function useCollectionProbe(address: string) {
  const looksLikeAddress = /^0x[0-9a-fA-F]{40}$/.test(address.trim());
  const target = looksLikeAddress ? (address.trim() as `0x${string}`) : undefined;

  const common = { address: target, abi: erc721Abi } as const;
  const enabled = { query: { enabled: target !== undefined, retry: false } };

  // 0x80ac58cd is the ERC-721 interface id. A contract that does not answer this
  // is not something the marketplace can move.
  const { data: isErc721, isLoading: checking } = useReadContract({
    address: target,
    abi: erc165Abi,
    functionName: "supportsInterface",
    args: [ERC721_INTERFACE_ID],
    ...enabled,
  });

  const { data: name } = useReadContract({ ...common, functionName: "name", ...enabled });
  const { data: symbol } = useReadContract({ ...common, functionName: "symbol", ...enabled });

  return {
    looksLikeAddress,
    checking: looksLikeAddress && checking,
    isErc721: isErc721 === true,
    name: name as string | undefined,
    symbol: symbol as string | undefined,
    address: target,
  };
}
