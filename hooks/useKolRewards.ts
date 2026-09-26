"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useWriteContract } from "@/hooks/useChainWrite";
import { useTxOutcome } from "@/hooks/useTxOutcome";
import { KOL_REWARDS_ABI, KOL_REWARDS_ADDRESS } from "@/config/kolRewards";
import { KOLS } from "@/config/kols";
import { valuechain } from "@/config/chain";

/**
 * The KOL claim, as the page needs it: where the whole set stands, and which
 * portrait — if any — belongs to the connected wallet.
 *
 * Every roster entry's status is one multicall, so the page learns everything
 * at once rather than card by card. Re-read on a slow timer so one KOL watching
 * the page sees another's claim land, and on the receipt of their own — never
 * on the click, which is the refetch-before-confirmation bug this codebase has
 * already shipped once.
 */

export type Stage =
  /** No contract yet: the page is a showcase. */
  | "soon"
  /** Deployed, wallets being recorded, not opened. */
  | "preparing"
  | "open"
  | "ended";

export interface KolStatus {
  /** Recorded wallet, or undefined until one is set. */
  wallet: `0x${string}` | undefined;
  claimed: boolean;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const deployed = KOL_REWARDS_ADDRESS !== "";
const contract = { address: KOL_REWARDS_ADDRESS as `0x${string}`, abi: KOL_REWARDS_ABI } as const;

export function useKolRewards() {
  const { address } = useAccount();

  // Two reads rather than one: wagmi cannot type a mixed list. The client
  // batches both into multicall regardless.
  const meta = useReadContracts({
    contracts: [
      { ...contract, functionName: "reward" },
      { ...contract, functionName: "deadline" },
      { ...contract, functionName: "portraits" },
    ],
    query: { enabled: deployed, refetchInterval: 20_000 },
  });
  const status = useReadContracts({
    contracts: KOLS.map((k) => ({ ...contract, functionName: "statusOf", args: [BigInt(k.n)] }) as const),
    query: { enabled: deployed, refetchInterval: 20_000 },
  });

  const reward = meta.data?.[0]?.result as bigint | undefined;
  const deadline = meta.data?.[1]?.result as bigint | undefined;
  const portraits = meta.data?.[2]?.result as `0x${string}` | undefined;

  /** Keyed by token id. Empty until read. */
  const statuses = useMemo(() => {
    const map = new Map<number, KolStatus>();
    if (status.data === undefined) return map;
    KOLS.forEach((k, i) => {
      const r = status.data[i]?.result as readonly [`0x${string}`, boolean] | undefined;
      if (r === undefined) return;
      map.set(k.n, { wallet: r[0] === ZERO ? undefined : r[0], claimed: r[1] });
    });
    return map;
  }, [status.data]);
  const isLoading = meta.isLoading || status.isLoading;

  // A clock for "has the deadline passed", ticking once a minute. Reading
  // Date.now() inline would freeze at first render.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(t);
  }, []);

  const stage: Stage | undefined = !deployed
    ? "soon"
    : deadline === undefined
      ? undefined
      : deadline === 0n
        ? "preparing"
        : now > Number(deadline)
          ? "ended"
          : "open";

  /** The portrait recorded for the connected wallet. One wallet, one portrait. */
  const mine = useMemo(() => {
    if (address === undefined) return undefined;
    const lower = address.toLowerCase();
    const kol = KOLS.find((k) => statuses.get(k.n)?.wallet?.toLowerCase() === lower);
    return kol === undefined ? undefined : { kol, claimed: statuses.get(kol.n)?.claimed ?? false };
  }, [address, statuses]);

  const claimedCount = useMemo(
    () => [...statuses.values()].filter((s) => s.claimed).length,
    [statuses],
  );

  // --- the claim ---------------------------------------------------------

  const write = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const outcome = useTxOutcome({ hash });

  const claim = async (id: number) => {
    write.reset();
    setHash(undefined);
    try {
      const sent = await write.writeContractAsync({
        ...contract,
        chainId: valuechain.id,
        functionName: "claim",
        args: [BigInt(id)],
      });
      setHash(sent);
    } catch {
      // Surfaced through `write.error`, which TxResult reads — including a
      // rejection, which it renders quietly rather than as a failure.
    }
  };

  // Settle the page from the chain once the receipt lands, success or revert.
  const refetchMeta = meta.refetch;
  const refetchStatus = status.refetch;
  useEffect(() => {
    if (outcome.isSuccess || outcome.reverted) {
      void refetchMeta();
      void refetchStatus();
    }
  }, [outcome.isSuccess, outcome.reverted, refetchMeta, refetchStatus]);

  return {
    deployed,
    loading: deployed && isLoading,
    stage,
    reward,
    deadline: deadline === undefined || deadline === 0n ? undefined : Number(deadline),
    portraits,
    statuses,
    claimedCount,
    mine,
    claim,
    tx: {
      hash,
      /** In the wallet, or sent and waiting for a receipt. */
      busy: write.isPending || (hash !== undefined && outcome.isLoading),
      signing: write.isPending,
      confirming: hash !== undefined && outcome.isLoading,
      success: outcome.isSuccess,
      error: (write.error ?? outcome.error ?? null) as Error | null,
    },
  };
}
