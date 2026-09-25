"use client";

import { useCallback, useState } from "react";
import { useAccount, useSwitchChain, useWriteContract as useWagmiWriteContract } from "wagmi";
import { valuechain } from "@/config/chain";

/**
 * wagmi's `useWriteContract`, except that it moves the wallet to ValueChain
 * first when it is somewhere else.
 *
 * Every write here names `chainId: valuechain.id`, which is right — it stops a
 * transaction going to a chain that has never heard of the contract — but on
 * its own it only refuses. This asks the wallet to switch (and add ValueChain,
 * if the wallet does not know it), then sends. A person sees one "switch
 * network?" prompt instead of an error telling them to go and find the setting.
 *
 * The network is read from the connection (`useAccount().chainId`), not from
 * `useChainId()`: the config lists one chain, and `useChainId()` only reports
 * chains the config knows — so a wallet on Ethereum read as ValueChain and
 * every write was simply refused (reported 2026-09-25). Current MetaMask keeps a
 * network PER SITE, so a user can be looking at their ValueChain balance while
 * MetaMask connects this site on Ethereum; that is the ordinary way to get here.
 *
 * A drop-in replacement: same fields, same names. A refused switch surfaces
 * through `error` like any other refusal, and `isPending` covers the switch.
 */
export function useWriteContract() {
  const write = useWagmiWriteContract();
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [switchError, setSwitchError] = useState<Error | null>(null);

  /** To the network the write names — ValueChain for every write here. */
  const ensureChain = useCallback(
    async (target: number | undefined) => {
      const want = target ?? valuechain.id;
      if (!isConnected || chainId === want) return;
      await switchChainAsync({ chainId: want as typeof valuechain.id });
    },
    [isConnected, chainId, switchChainAsync],
  );

  const targetOf = (variables: unknown) => (variables as { chainId?: number }).chainId;

  const writeContract = useCallback(
    ((variables, options) => {
      setSwitchError(null);
      ensureChain(targetOf(variables)).then(
        () => write.writeContract(variables, options),
        (err: unknown) => setSwitchError(err instanceof Error ? err : new Error(String(err))),
      );
    }) as typeof write.writeContract,
    [ensureChain, write.writeContract],
  );

  const writeContractAsync = useCallback(
    (async (variables, options) => {
      setSwitchError(null);
      await ensureChain(targetOf(variables));
      return write.writeContractAsync(variables, options);
    }) as typeof write.writeContractAsync,
    [ensureChain, write.writeContractAsync],
  );

  const reset = useCallback(() => {
    setSwitchError(null);
    write.reset();
  }, [write.reset]);

  return {
    ...write,
    writeContract,
    writeContractAsync,
    reset,
    error: write.error ?? switchError,
    isPending: write.isPending || switching,
  };
}
