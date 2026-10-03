"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseGwei } from "viem";
import { useWriteContract } from "@/hooks/useChainWrite";
import { SEAPORT, SeaportAbi } from "@/config/seaport";
import { valuechain } from "@/config/chain";
import { LISTINGS_PER_TX, planBulkCancel } from "@/lib/seaport";
import { useVerifiedContracts } from "@/hooks/useVerifiedContracts";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";

/**
 * Withdraw many listings at once (2026-10-03) — the other half of
 * `useBulkList`, and built the same way for the same reasons.
 *
 * `cancel` takes an array and this app had always passed one, so a seller
 * repricing twenty boxes signed twenty times. Now it is one confirmation per
 * fifty (`planBulkCancel` decides what goes in each), sent one batch at a time
 * and each waited on, with ValueChain's suggested gas price overridden — a
 * batch is far bigger than a transfer, and a stuck one freezes every later
 * transaction from the wallet (see `useBulkList`).
 *
 * The counter is read at the moment of sending, not remembered: a cancel
 * built with a stale one addresses orders that do not exist, and Seaport
 * accepts it and does nothing.
 */
const GAS_PRICE = parseGwei("0.05");

export interface BulkCancelProgress {
  done: number;
  total: number;
  cancelled: number;
  requested: number;
  busy: boolean;
}

const IDLE: BulkCancelProgress = { done: 0, total: 0, cancelled: 0, requested: 0, busy: false };

export function useBulkCancel() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const identity = useVerifiedContracts();
  const queryClient = useQueryClient();

  const [progress, setProgress] = useState<BulkCancelProgress>(IDLE);
  const [error, setError] = useState<Error | undefined>(undefined);

  const reset = useCallback(() => {
    setProgress(IDLE);
    setError(undefined);
  }, []);

  const cancelMany = useCallback(
    async (orders: readonly SeaportOrder[]) => {
      if (address === undefined || client === undefined) return;
      if (identity.mismatch) {
        setError(new Error("Seaport is not the contract this build expects. Nothing was sent."));
        return;
      }

      let batches;
      try {
        const counter = (await client.readContract({
          address: SEAPORT,
          abi: SeaportAbi,
          functionName: "getCounter",
          args: [address],
        })) as bigint;
        batches = planBulkCancel({ seller: address, orders, counter });
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Could not read your orders just now."));
        return;
      }
      if (batches.length === 0) return;

      const requested = batches.reduce((n, b) => n + b.length, 0);
      setError(undefined);
      setProgress({ done: 0, total: batches.length, cancelled: 0, requested, busy: true });

      let cancelled = 0;
      for (const [i, batch] of batches.entries()) {
        try {
          const hash = await writeContractAsync({
            chainId: valuechain.id,
            address: SEAPORT,
            abi: SeaportAbi,
            functionName: "cancel",
            args: [batch],
            gasPrice: GAS_PRICE,
          });
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") {
            throw new Error(`Batch ${i + 1} of ${batches.length} was rejected on chain.`);
          }
          cancelled += batch.length;
          setProgress({ done: i + 1, total: batches.length, cancelled, requested, busy: i + 1 < batches.length });
        } catch (e) {
          // Everything already confirmed is withdrawn and stays withdrawn.
          setError(e instanceof Error ? e : new Error("The wallet rejected the transaction."));
          setProgress({ done: i, total: batches.length, cancelled, requested, busy: false });
          break;
        }
      }

      /**
       * Every surface reads these orders — cards, the floor, the market — and
       * a cancel changes all of them at once, so re-read the lot rather than
       * name the keys and miss one.
       */
      void queryClient.invalidateQueries();
    },
    [address, client, identity.mismatch, queryClient, writeContractAsync],
  );

  return { cancelMany, progress, error, reset, perTransaction: LISTINGS_PER_TX };
}
