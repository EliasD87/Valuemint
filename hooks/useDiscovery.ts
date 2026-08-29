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
 * ERC-1155 is deliberately excluded: the marketplace only handles ERC-721, so
 * listing a 1155 here would produce a buy button that always reverts.
 */

export interface DiscoveredCollection {
  address: `0x${string}`;
  name: string;
  symbol: string;
  totalSupply?: string;
  holders?: number;
  /** True when this collection came out of our factory. */
  fromFactory?: boolean;
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

export function useDiscoveredCollections() {
  return useQuery({
    queryKey: ["discovered-erc721"],
    staleTime: 60_000,
    queryFn: async (): Promise<DiscoveredCollection[]> => {
      const res = await fetch(`${deployment.explorer}/api/v2/tokens?type=ERC-721`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Explorer returned ${res.status}`);

      const body = (await res.json()) as { items?: BlockscoutToken[] };

      return (body.items ?? [])
        .map((t) => {
          const address = (t.address_hash ?? t.address ?? "") as `0x${string}`;
          return {
            address,
            name: t.name ?? "Untitled collection",
            symbol: t.symbol ?? "",
            totalSupply: t.total_supply,
            holders: Number(t.holders_count ?? t.holders ?? 0),
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
