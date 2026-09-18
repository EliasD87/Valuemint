"use client";

import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { enumerableAbi } from "@/config/erc721";
import { useTokenDocuments } from "@/hooks/useTokenDocuments";
import { resolveMediaUrl } from "@/lib/format";
import { useAllCollections, type CollectionSummary } from "@/hooks/useAllCollections";
import { useBestListings } from "@/hooks/useSeaportOrders";
import { toListing, type Listing } from "@/lib/seaport";
import type { TokenMetadata } from "@/hooks/useCollection";
import { tierOf, traitOf } from "@/lib/tokenMetadata";

/**
 * Tokens across every collection on the chain, rather than one hardcoded address.
 *
 * The marketplace hosts collections; it is not one. Pages that walked a single
 * collection were the reason listings and holdings kept showing only the first
 * collection ever deployed here.
 *
 * Each collection is capped at `perCollection` tokens so one very large one
 * cannot stall the page. That is a display limit, not a claim about what exists,
 * and the pages say so where it bites.
 */

export interface ChainToken {
  collection: `0x${string}`;
  collectionName: string;
  id: bigint;
  owner?: `0x${string}`;
  listing?: Listing;
  metadata?: TokenMetadata;
  design?: string;
  tier?: string;
  edition?: string;
  image?: string;
  /**
   * The raw `tokenURI`, carried so a card can tell two very different things
   * apart: `undefined` is "the contract has not answered yet", and `""` is
   * "the contract answered, and its answer was nothing".
   *
   * Without it both rendered the same loading shimmer, so a collection that
   * publishes no metadata at all looked like a collection that was still
   * loading — forever. TestSoDEXTreasureBox is exactly that: it claims
   * ERC721Metadata support and returns an empty string for every token.
   */
  uri?: string;
}






export function useEverything(perCollection = 30) {
  const { collections, isLoading: loadingCollections } = useAllCollections();

  /**
   * Listings come from Seaport's own event log, not from a per-token call.
   *
   * The previous shape asked the marketplace `getListing(collection, id)` for
   * every token on screen - a third of every multicall spent finding out that
   * most tokens are not for sale. Seaport announces each order once, so one
   * cached scan answers for every token at once and the per-token reads drop
   * from three to two.
   */
  const { best: bestListings } = useBestListings();

  // Supply per collection, so we know which ids exist without guessing.
  const { data: supplies } = useReadContracts({
    contracts: collections.map((c) => ({
      address: c.address,
      abi: enumerableAbi,
      functionName: "totalSupply" as const,
    })),
    query: { enabled: collections.length > 0, refetchInterval: 30_000 },
  });

  /**
   * Which ids exist, asked rather than assumed.
   *
   * This used to walk 1..totalSupply, which is only right for collections that
   * happen to number their tokens that way. The Trenches encodes the tier in
   * the id — its first token is 1000001 — so `ownerOf(1)` reverted, every slot
   * came back empty, and the collection card showed no preview at all.
   *
   * `tokenByIndex` is the ERC-721 Enumerable answer and works whatever the
   * numbering. A collection that is not Enumerable simply fails these calls,
   * and the sequential guess below is kept as the fallback for those.
   */
  const indexSlots: Array<{ collection: CollectionSummary; index: number }> = [];
  collections.forEach((c, i) => {
    const entry = supplies?.[i];
    if (entry?.status !== "success") return;

    const count = Math.min(Number(entry.result as bigint), perCollection);
    for (let n = 0; n < count; n++) indexSlots.push({ collection: c, index: n });
  });

  const { data: idsByIndex } = useReadContracts({
    contracts: indexSlots.map((s) => ({
      address: s.collection.address,
      abi: enumerableAbi,
      functionName: "tokenByIndex" as const,
      args: [BigInt(s.index)],
    })),
    query: { enabled: indexSlots.length > 0, refetchInterval: 30_000 },
  });

  /** One flat list of every (collection, tokenId) worth loading. */
  const slots: Array<{ collection: CollectionSummary; id: bigint; fromIndex: boolean }> = indexSlots.map((s, i) => {
    const entry = idsByIndex?.[i];
    const answered = entry?.status === "success";
    return {
      collection: s.collection,
      /**
       * Not Enumerable, or the call has not landed yet: guess sequentially.
       *
       * Correct for every collection from our factory, and wrong for a
       * collection that numbers its tokens any other way - so the guess is
       * marked, and filtered out below unless `ownerOf` vouches for it.
       */
      id: answered ? (entry.result as bigint) : BigInt(s.index + 1),
      /** The contract's own answer, rather than our assumption about it. */
      fromIndex: answered,
    };
  });

  const { data: chainData, isLoading: loadingChain } = useReadContracts({
    contracts: slots.flatMap((s) => [
      { address: s.collection.address, abi: erc721Abi, functionName: "ownerOf" as const, args: [s.id] },
      { address: s.collection.address, abi: erc721Abi, functionName: "tokenURI" as const, args: [s.id] },
    ]),
    query: { enabled: slots.length > 0, refetchInterval: 25_000 },
  });

  const uris = slots.map((_, i) => {
    const entry = chainData?.[i * 2 + 1];
    return entry?.status === "success" ? (entry.result as string) : undefined;
  });

  const { documents: metadata, isLoading: loadingMeta } = useTokenDocuments(uris);

  /**
   * A guessed id has to be vouched for before it can reach a page.
   *
   * This is the same fault `useTokenIds` had, in the second of the two places
   * that guess: TestSoDEXTreasureBox reports a supply of 3,121 whose lowest id
   * is 4,408, because its pieces are task rewards handed out as people earn
   * them. Walking 1..n found none of them and drew a card for each miss - a
   * permanent grey tile, no owner, linking to a token page for nothing.
   *
   * `ownerOf` is already read for every slot below, so the gate is free: an id
   * that came from `tokenByIndex` is the contract's own answer and is trusted,
   * and an id we guessed is kept only when the chain confirms somebody owns it.
   * While the read is still in flight nothing is dropped, so the grid fills in
   * rather than flickering.
   */
  const tokens: ChainToken[] = slots.map((slot, i) => {
    const ownerEntry = chainData?.[i * 2];
    const order = bestListings.get(`${slot.collection.address.toLowerCase()}-${slot.id}`);
    const m = metadata?.[i];

    return {
      collection: slot.collection.address,
      collectionName: slot.collection.name,
      id: slot.id,
      owner: ownerEntry?.status === "success" ? (ownerEntry.result as `0x${string}`) : undefined,
      listing: order === undefined ? undefined : toListing(order),
      metadata: m,
      design: traitOf(m, "Design") ?? m?.name,
      tier: tierOf(m),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
      uri: uris[i],
    };
  })
    .filter((_t, i) => {
      const slot = slots[i];
      if (slot === undefined) return false;
      // The contract's own id: always keep it.
      if (slot.fromIndex) return true;
      // Still reading: keep it, so the grid fills in rather than flickering.
      if (chainData === undefined) return true;
      // A guess. It stays only if somebody actually owns it.
      return chainData[i * 2]?.status === "success";
    });

  return {
    tokens,
    collections,
    /**
     * Only true with nothing on screen. `loadingMeta` in particular resolves
     * per-token and would otherwise keep the whole grid in skeletons while the
     * last slow gateway fetch finished.
     */
    isLoading: tokens.length === 0 && (loadingCollections || loadingChain || loadingMeta),
    /**
     * Metadata alone, exposed separately because `isLoading` deliberately hides
     * it once anything is on screen.
     *
     * A caller that filters on `image` needs this. Token ids arrive from the
     * chain in a few hundred milliseconds; the images they point at come from
     * IPFS gateways seconds later. In between, every token has
     * `image === undefined` while `isLoading` is already false - so a grid that
     * drops image-less tokens is empty and *not* loading, which is how the home
     * page ended up rendering "Nothing matches that filter" over a chip row
     * reading 12, 12, 12, 7, 5.
     */
    loadingMetadata: loadingMeta,
    /** True when at least one collection has more tokens than we loaded. */
    truncated: collections.some((_, i) => {
      const entry = supplies?.[i];
      return entry?.status === "success" && Number(entry.result as bigint) > perCollection;
    }),
  };
}
