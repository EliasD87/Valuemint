"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { TRENCHES_ABI, TRENCHES_ADDRESS } from "@/config/trenches";

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
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

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

    setPhase({ kind: "signing" });
    let sent: `0x${string}`;
    try {
      sent = await writeContractAsync({
        ...contract,
        functionName: "claim",
        args: [auth.maxTier, BigInt(auth.deadline), auth.signature],
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
  }, [address, contract, deployed, reset, writeContractAsync]);

  // The receipt landing is what makes the claim real, so the owed list is
  // re-read from the chain rather than assumed empty.
  useEffect(() => {
    if (!isSuccess || phase.kind !== "confirming") return;
    setPhase({ kind: "done" });
    void refetchOwed();
  }, [isSuccess, phase.kind, refetchOwed]);

  return {
    deployed,
    open: open === true,
    /** How many pieces this wallet can take right now, or undefined while loading. */
    owedCount: owed === undefined ? undefined : owed.length,
    loadingOwed,
    phase,
    claim,
    reset: () => {
      setPhase({ kind: "idle" });
      setHash(undefined);
    },
  };
}
