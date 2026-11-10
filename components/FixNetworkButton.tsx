"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { numberToHex } from "viem";
import { valuechain } from "@/config/chain";
import { STEADY_RPC } from "@/lib/txError";
import { useT } from "@/lib/i18n";

/**
 * Point the connected wallet at the ValueChain server that keeps up.
 *
 * A wallet sends a purchase through its own connection to the chain, set when
 * the network was added — often rpc.valuechain.xyz, which turns short bursts
 * away (2026-11-01: 4 of 60 refused; mainnet.valuechain.xyz refused none).
 * MetaMask then flags the network "unreliable" and buys fail with -32005.
 *
 * `wallet_addEthereumChain` for a network the wallet already has is how a site
 * proposes a new server for it: MetaMask shows its own prompt to add the URL
 * and use it, and nothing changes unless the person approves there. Wallets
 * that do not support updating answer without asking, which is why the
 * follow-up says how to change it by hand.
 */
export function FixNetworkButton() {
  const t = useT();
  const { connector, isConnected } = useAccount();
  const [state, setState] = useState<"idle" | "asking" | "sent" | "failed">("idle");

  if (!isConnected || connector === undefined) return null;

  const fix = async () => {
    setState("asking");
    try {
      const provider = (await connector.getProvider()) as {
        request(args: { method: string; params?: unknown[] }): Promise<unknown>;
      };
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: numberToHex(valuechain.id),
            chainName: valuechain.name,
            nativeCurrency: valuechain.nativeCurrency,
            rpcUrls: [STEADY_RPC],
            blockExplorerUrls: [valuechain.blockExplorers.default.url],
          },
        ],
      });
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent" || state === "failed") {
    // One key for the instruction; the server address sits where {url} does.
    const [before = "", after = ""] = t(
      "If it did not ask you, change it by hand: wallet settings, Networks, ValueChain, RPC URL {url}. Then try again.",
    ).split("{url}");
    return (
      <span className="txr-fix-note">
        {state === "sent" ? t("Sent to your wallet.") : t("Your wallet did not take the update.")}{" "}
        {before}
        <b>{STEADY_RPC}</b>
        {after}
      </span>
    );
  }

  return (
    <button type="button" className="btn btn-sm txr-fix" disabled={state === "asking"} onClick={() => void fix()}>
      {state === "asking" ? t("Check your wallet…") : t("Switch my wallet to the steadier server")}
    </button>
  );
}
