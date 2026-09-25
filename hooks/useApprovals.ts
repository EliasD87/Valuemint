"use client";

import { useEffect, useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useWriteContract } from "@/hooks/useChainWrite";
import { useTxOutcome } from "@/hooks/useTxOutcome";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { SEAPORT } from "@/config/seaport";
import { valuechain } from "@/config/chain";
import { useAllCollections, type CollectionSummary } from "@/hooks/useAllCollections";

/**
 * Standing approvals this wallet has granted, and the means to take them back.
 *
 * `setApprovalForAll` is the single most dangerous thing a marketplace asks of
 * anyone: it is not "let this contract move this token for this sale", it is
 * "let this contract move every token in this collection, for as long as I own
 * them, with no further signature". The app asked for it and never once offered
 * a way out, so every approval ever granted here is still live — including to
 * two marketplaces nothing trades on any more and one that is paused.
 *
 * Approvals cost nothing to hold and everything to be wrong about. A bug or a
 * key compromise in an operator drains the collection, and the only defence a
 * holder has is not to be approved to it.
 */

/** A contract a wallet may have approved, and what that means today. */
export interface Operator {
  address: `0x${string}`;
  name: string;
  /**
   * `needed` — revoking breaks something the app does.
   * `retired` — nothing here uses it; an approval is pure exposure.
   */
  standing: "needed" | "retired";
  why: string;
}

export const OPERATORS: readonly Operator[] = [
  {
    address: SEAPORT,
    name: "Seaport 1.6",
    standing: "needed",
    why: "Needed to trade here. Revoking pauses your listings until you approve again.",
  },
  {
    address: deployment.marketplace,
    name: "ValueMint marketplace v3",
    standing: "retired",
    why: "Paused and replaced. Nothing uses it.",
  },
  {
    address: "0xe8f896dea94EC68fF70dbE7406877fbC6448a02E",
    name: "ValueMint marketplace v2",
    standing: "retired",
    why: "Paused and replaced long ago.",
  },
  {
    address: "0x0c0c1209C54fD220BcE31c81a9C044cE5e8928C5",
    name: "ValueMint marketplace v1",
    standing: "retired",
    why: "Paused and replaced long ago.",
  },
] as const;

export interface Approval {
  collection: CollectionSummary;
  operator: Operator;
  /** How many tokens in this collection the approval currently exposes. */
  held: bigint;
}

/**
 * Every live approval the connected wallet has granted.
 *
 * Reads across every collection the app knows about rather than only those the
 * wallet holds: an approval survives selling the last token, and comes back to
 * life the moment another one arrives. A wallet holding nothing today can still
 * be approved, and that is exactly the case worth showing.
 */
export function useApprovals() {
  const { address } = useAccount();
  const { allIncludingHidden, isLoading: loadingCollections } = useAllCollections();

  const pairs = useMemo(
    () => allIncludingHidden.flatMap((c) => OPERATORS.map((o) => ({ collection: c, operator: o }))),
    [allIncludingHidden],
  );

  const { data, isLoading, refetch } = useReadContracts({
    contracts: pairs.map(({ collection, operator }) => ({
      address: collection.address,
      abi: ValueChainCollectionAbi,
      functionName: "isApprovedForAll" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000", operator.address] as const,
    })),
    query: { enabled: address !== undefined && pairs.length > 0, refetchInterval: 30_000 },
  });

  const { data: balances } = useReadContracts({
    contracts: allIncludingHidden.map((c) => ({
      address: c.address,
      abi: ValueChainCollectionAbi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: { enabled: address !== undefined && allIncludingHidden.length > 0, refetchInterval: 30_000 },
  });

  const heldBy = useMemo(() => {
    const m = new Map<string, bigint>();
    allIncludingHidden.forEach((c, i) => {
      const entry = balances?.[i];
      if (entry?.status === "success") m.set(c.address.toLowerCase(), entry.result as bigint);
    });
    return m;
  }, [allIncludingHidden, balances]);

  const approvals = useMemo(
    () =>
      pairs
        .map(({ collection, operator }, i) => {
          const entry = data?.[i];
          if (entry?.status !== "success" || entry.result !== true) return undefined;
          return {
            collection,
            operator,
            held: heldBy.get(collection.address.toLowerCase()) ?? 0n,
          } satisfies Approval;
        })
        .filter((a): a is Approval => a !== undefined)
        // Retired operators first, and within each the largest exposure first:
        // the rows that most deserve action are the ones at the top.
        .sort((a, b) => {
          if (a.operator.standing !== b.operator.standing) {
            return a.operator.standing === "retired" ? -1 : 1;
          }
          if (a.held !== b.held) return a.held > b.held ? -1 : 1;
          return a.collection.name.localeCompare(b.collection.name);
        }),
    [pairs, data, heldBy],
  );

  return {
    approvals,
    retired: approvals.filter((a) => a.operator.standing === "retired"),
    /** True only once the reads have actually answered, so "none" is not shown early. */
    isLoading: address !== undefined && (loadingCollections || isLoading),
    connected: address !== undefined,
    refetch,
  };
}

/** Revoking one approval. One write, and it reports what it did. */
export function useRevoke(onDone?: () => void) {
  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useTxOutcome({ hash });

  /**
   * Refetch on the receipt, never in the click handler. A read fired next to
   * `writeContract` runs before the wallet prompt is answered, so the row would
   * re-render still approved and the obvious response is to press again — the
   * mistake that had people approving twice.
   */
  useEffect(() => {
    if (isSuccess) onDone?.();
  }, [isSuccess, onDone]);

  return {
    revoke: (collection: `0x${string}`, operator: `0x${string}`) => {
      reset();
      writeContract({
        chainId: valuechain.id,
        address: collection,
        abi: ValueChainCollectionAbi,
        functionName: "setApprovalForAll",
        args: [operator, false],
      });
    },
    hash,
    signing,
    confirming,
    isSuccess,
    error,
    busy: signing || confirming,
  };
}
