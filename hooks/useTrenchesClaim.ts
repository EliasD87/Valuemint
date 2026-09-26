"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { useWriteContract } from "@/hooks/useChainWrite";
import { useTxOutcome } from "@/hooks/useTxOutcome";
import { TRENCHES_ABI, TRENCHES_ADDRESS, TRENCHES_CHAIN_ID } from "@/config/trenches";
import { valuechain } from "@/config/chain";

/**
 * Claiming the depths a wallet has earned.
 *
 * Two steps, and the order matters. The server is asked to authorise first —
 * it re-reads the wallet's SoDEX volume and signs a ceiling — and only then
 * does the browser send a transaction carrying that signature. The browser
 * never decides which tier it gets; it only relays a decision it cannot forge.
 *
 * One transaction takes every unclaimed tier up to the ceiling, because the
 * contract walks the ladder itself. Seven pieces is one signature and one
 * confirmation, not seven of each.
 */

export type ClaimPhase =
  | { kind: "idle" }
  | { kind: "authorising" }
  | { kind: "signing" }
  | { kind: "confirming" }
  | { kind: "done" }
  | { kind: "error"; message: string };

interface Authorisation {
  maxTier: number;
  deadline: number;
  signature: `0x${string}`;
}

/**
 * @param earned The deepest tier this wallet has *earned*, from the eligibility
 *        check. Required: asking the contract what is unclaimed out of all ten
 *        would count tiers the wallet has no right to, and the button would
 *        offer more pieces than the signature will actually mint.
 */
export function useTrenchesClaim(earned: number) {
  const { address } = useAccount();
  const [phase, setPhase] = useState<ClaimPhase>({ kind: "idle" });

  const deployed = TRENCHES_ADDRESS !== "";
  const contract = { address: TRENCHES_ADDRESS as `0x${string}`, abi: TRENCHES_ABI } as const;

  /** Whether the contract is accepting claims at all. */
  const { data: open } = useReadContract({
    ...contract,
    functionName: "claimOpen",
    query: { enabled: deployed },
  });

  /**
   * Which tiers this wallet still has to take: unclaimed *and* earned.
   *
   * Read from the chain rather than inferred, so a wallet that claimed on
   * another device is not offered pieces it already holds — and bounded by
   * `earned`, so it is not offered pieces it has not reached.
   */
  const {
    data: owed,
    refetch: refetchOwed,
    isLoading: loadingOwed,
  } = useReadContract({
    ...contract,
    functionName: "unclaimed",
    args: address === undefined ? undefined : [address, earned],
    query: { enabled: deployed && address !== undefined && earned > 0 },
  });

  const { writeContractAsync, reset } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isSuccess, reverted } = useTxOutcome({ hash });
  const client = usePublicClient({ chainId: TRENCHES_CHAIN_ID as typeof valuechain.id });

  const claim = useCallback(async () => {
    if (address === undefined || !deployed) return;

    reset();
    setHash(undefined);
    setPhase({ kind: "authorising" });

    let auth: Authorisation;
    try {
      const res = await fetch("/api/trenches/authorise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPhase({ kind: "error", message: body.error ?? "Could not authorise this claim." });
        return;
      }
      auth = body as Authorisation;
    } catch {
      setPhase({ kind: "error", message: "Could not reach the server to authorise this claim." });
      return;
    }

    /**
     * The gas limit, worked out here rather than left to the wallet.
     *
     * Each depth is a mint, about 145,000 gas apiece, so claiming seven at once
     * needs ~1,053,000. One wallet app sent every attempt with a flat 720,000
     * and ran out of gas six times in a row (2026-09-25/26) — the only failed
     * claims on the contract. Estimated against the real signature and padded
     * by a quarter; if the estimate itself fails, the wallet is left to decide,
     * as before.
     */
    let gas: bigint | undefined;
    try {
      const estimate = await client?.estimateContractGas({
        ...contract,
        functionName: "claim",
        args: [auth.maxTier, BigInt(auth.deadline), auth.signature],
        account: address,
      });
      gas = estimate === undefined ? undefined : (estimate * 125n) / 100n;
    } catch {
      gas = undefined;
    }

    setPhase({ kind: "signing" });
    let sent: `0x${string}`;
    try {
      sent = await writeContractAsync({
        ...contract,
        // The only write in the app that was missing this. Without it wagmi
        // sends to whatever network the wallet happens to be on, and a claim
        // broadcast to a chain that has never heard of this contract fails as
        // the node's own "resource not available" rather than as a refusal.
        // Configurable so a local build can point at a local chain; wagmi's
        // type wants the literal, and this is that value at runtime.
        chainId: TRENCHES_CHAIN_ID as typeof valuechain.id,
        functionName: "claim",
        args: [auth.maxTier, BigInt(auth.deadline), auth.signature],
        ...(gas === undefined ? {} : { gas }),
      });
    } catch (error) {
      // A rejected signature is a decision, not a failure; say nothing alarming.
      const message = error instanceof Error ? error.message : "";
      setPhase(
        /denied|rejected|User rejected/i.test(message)
          ? { kind: "idle" }
          : { kind: "error", message: "The claim transaction did not go through." },
      );
      return;
    }

    setHash(sent);
    setPhase({ kind: "confirming" });
  }, [address, client, contract, deployed, reset, writeContractAsync]);

  // The receipt landing is what makes the claim real, so the owed list is
  // re-read from the chain rather than assumed empty.
  useEffect(() => {
    if (!isSuccess || phase.kind !== "confirming") return;
    setPhase({ kind: "done" });
    void refetchOwed();
  }, [isSuccess, phase.kind, refetchOwed]);

  // A claim mined but reverted used to leave the page on "confirming" for
  // good. Nothing was claimed, so say so and let them try again.
  useEffect(() => {
    if (!reverted || phase.kind !== "confirming") return;
    setPhase({
      kind: "error",
      message: "The claim transaction failed on chain, so nothing was claimed. Try again — you only paid a little gas.",
    });
    void refetchOwed();
  }, [reverted, phase.kind, refetchOwed]);

  return {
    deployed,
    /** Undefined until read: "not known yet" must not render as "paused". */
    open: open as boolean | undefined,
    /** How many pieces this wallet can take right now, or undefined while loading. */
    owedCount: owed === undefined ? undefined : owed.length,
    loadingOwed,
    phase,
    /** The claim transaction, once sent — for a link to it on the explorer. */
    hash,
    claim,
    reset: () => {
      setPhase({ kind: "idle" });
      setHash(undefined);
    },
  };
}
