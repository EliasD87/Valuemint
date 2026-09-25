"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract } from "@/hooks/useChainWrite";
import { parseEther, parseGwei, type Address } from "viem";
import { SEAPORT, SeaportAbi } from "@/config/seaport";
import { valuechain } from "@/config/chain";
import { asOrder, planBulkListing, LISTINGS_PER_TX } from "@/lib/seaport";
import { useVerifiedContracts } from "@/hooks/useVerifiedContracts";
import { rememberValidatedOrders } from "@/lib/pendingOrders";

/**
 * List many tokens at one price, in as few transactions as Seaport allows.
 *
 * `validate` takes `Order[]` and this app had always passed an array of one, so
 * listing 626 treasure boxes meant 626 wallet confirmations. Nobody does that.
 * The boxes are handed out in the thousands and unevenly - a holder with
 * hundreds is the ordinary case - so one-at-a-time is not a rough edge, it is
 * the feature failing.
 *
 * At `LISTINGS_PER_TX` (50, and see that constant for why not 200) the same 626
 * listings are 13 confirmations, and cost *less* gas in total than sending them
 * singly: 26M against 40M.
 *
 * ---
 *
 * **Sequential, deliberately.** Each batch is sent and waited on before the next
 * is offered. Firing thirteen transactions at a wallet at once produces thirteen
 * prompts in an order nobody controls, and any that mine out of order still
 * work but arrive as a mess. Waiting also means a failure stops the run with a
 * true count of what already succeeded, rather than leaving the seller to guess.
 *
 * **An explicit gas price, which is not optional here.** ValueChain's suggested
 * price is enough for a transfer and not for anything larger: a 313k-gas
 * transaction sat unmined for 400+ blocks at it, with no error and no rejection.
 * A batch of 50 is 2.0M gas. Worse, a stuck transaction holds a nonce, and every
 * later one from that wallet queues behind it - so a bulk listing sent at the
 * suggested price would not merely fail, it would freeze the seller's wallet
 * mid-run. 0.05 gwei is ~25x the suggestion and still a fraction of a cent.
 */

/**
 * See `valuechain-gas-price-trap`. The same constant the Safe console uses, for
 * the same reason, and this is the other place in the app that sends something
 * far bigger than a transfer.
 */
const GAS_PRICE = parseGwei("0.05");

export interface BulkListProgress {
  /** Batches confirmed on chain so far. */
  done: number;
  /** Batches in the whole run. */
  total: number;
  /** Tokens confirmed listed so far — what the seller actually cares about. */
  listed: number;
  /** Tokens the run set out to list. */
  requested: number;
  /** A batch is in the wallet or in flight. */
  busy: boolean;
}

const IDLE: BulkListProgress = { done: 0, total: 0, listed: 0, requested: 0, busy: false };

export function useBulkList(collection: Address | undefined) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  /**
   * The same gate `setApprovalForAll` and `list` carry.
   *
   * It matters more here, not less: a mismatched `SEAPORT` would be handed
   * hundreds of orders in one click instead of one.
   */
  const identity = useVerifiedContracts();

  const [progress, setProgress] = useState<BulkListProgress>(IDLE);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>(undefined);

  const reset = useCallback(() => {
    setProgress(IDLE);
    setError(undefined);
    setLastHash(undefined);
  }, []);

  const listMany = useCallback(
    async (tokenIds: readonly bigint[], priceInSoso: string, days?: number) => {
      if (collection === undefined || address === undefined || client === undefined) return;
      if (identity.mismatch) {
        setError(new Error("Seaport is not the contract this build expects. Nothing was sent."));
        return;
      }

      let batches;
      try {
        batches = planBulkListing({
          seller: address,
          collection,
          tokenIds,
          priceWei: parseEther(priceInSoso),
          days,
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error("That price is not a number."));
        return;
      }
      if (batches.length === 0) return;

      const requested = batches.reduce((n, b) => n + b.length, 0);
      setError(undefined);
      setProgress({ done: 0, total: batches.length, listed: 0, requested, busy: true });

      let listed = 0;
      for (const [i, batch] of batches.entries()) {
        try {
          const hash = await writeContractAsync({
            chainId: valuechain.id,
            address: SEAPORT,
            abi: SeaportAbi,
            functionName: "validate",
            args: [batch.map(asOrder)],
            gasPrice: GAS_PRICE,
          });
          setLastHash(hash);

          /**
           * Wait for the receipt, and check it succeeded.
           *
           * A mined transaction is not a successful one. `validate` reverting
           * on batch three while the UI counted it as done would tell a seller
           * fifty tokens are for sale when none of them are.
           */
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") {
            throw new Error(`Batch ${i + 1} of ${batches.length} was rejected on chain.`);
          }

          /**
           * Hold on to what this batch just validated.
           *
           * The single-listing path has always done this and the bulk path
           * never did, which left a window of about thirty seconds — the order
           * book reads six confirmations behind the head and polls — where the
           * whole app still believed these tokens were unlisted. The portfolio
           * offered to list them again, and so did the home page prompt sitting
           * right under the button that had just done it.
           *
           * Pressing it again is not a no-op. `validate` takes a fresh salt, so
           * the second press writes a *second* live order on the same token at
           * whatever price is typed, and a buyer takes the cheaper of the two.
           * Seen for real: SoDEXTreasureBox #43653, listed twice at 10 SOSO.
           *
           * `rememberValidatedOrders` reads every `OrderValidated` in the
           * receipt — which is what its own comment says it is for, bulk
           * included — and feeds them to the same store the single path uses,
           * so every surface sees them at once.
           */
          rememberValidatedOrders(receipt);

          listed += batch.length;
          setProgress({
            done: i + 1,
            total: batches.length,
            listed,
            requested,
            busy: i + 1 < batches.length,
          });
        } catch (e) {
          /**
           * Stop, and keep the count honest.
           *
           * Everything already confirmed is genuinely listed and stays listed -
           * these are independent orders, not one transaction - so the seller
           * is told how many worked rather than being left to guess, and can
           * re-run for the rest.
           */
          setError(e instanceof Error ? e : new Error("The wallet rejected the transaction."));
          setProgress({ done: i, total: batches.length, listed, requested, busy: false });
          return;
        }
      }
    },
    [address, client, collection, identity.mismatch, writeContractAsync],
  );

  return {
    listMany,
    reset,
    progress,
    error,
    lastHash,
    /** How many tokens one confirmation covers, for the UI to say so up front. */
    perTransaction: LISTINGS_PER_TX,
  };
}
