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
/** How long a wallet gets to answer a switch before we stop waiting. */
const SWITCH_TIMEOUT_MS = 20_000;

/** What to tell someone whose wallet did not switch. */
export const SWITCH_STALLED =
  "Your wallet did not switch to ValueChain. Open the wallet you connected with, switch it to ValueChain, and try again.";

/**
 * Ask the CONNECTED wallet to move to `chainId`, and stop waiting after 20s.
 *
 * Two things went wrong with a bare `switchChain` (reported 2026-09-25):
 *
 *   - **The wrong wallet answered.** With several wallets installed, whichever
 *     one owns `window.ethereum` — Phantom, often — can pick up a request not
 *     aimed at a named connector. The switch now names the connector the
 *     account is actually connected through.
 *   - **It waited forever.** wagmi resolves a switch on the wallet's
 *     `chainChanged` event; a wallet that was removed, or never answers, left
 *     the button on "Switching…" for good. After SWITCH_TIMEOUT_MS the promise
 *     rejects with SWITCH_STALLED and the button comes back.
 */
export function useSwitchToChain() {
  const { connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [switching, setSwitching] = useState(false);

  const switchTo = useCallback(
    async (chainId: number = valuechain.id) => {
      setSwitching(true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          switchChainAsync({ chainId: chainId as typeof valuechain.id, connector }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(SWITCH_STALLED)), SWITCH_TIMEOUT_MS);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        setSwitching(false);
      }
    },
    [connector, switchChainAsync],
  );

  return { switchTo, switching };
}

export function useWriteContract() {
  const write = useWagmiWriteContract();
  const { isConnected, chainId } = useAccount();
  const { switchTo, switching } = useSwitchToChain();
  const [switchError, setSwitchError] = useState<Error | null>(null);

  /** To the network the write names — ValueChain for every write here. */
  const ensureChain = useCallback(
    async (target: number | undefined) => {
      const want = target ?? valuechain.id;
      if (!isConnected || chainId === want) return;
      await switchTo(want);
    },
    [isConnected, chainId, switchTo],
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
