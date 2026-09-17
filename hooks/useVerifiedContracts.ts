"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { CONDUIT_CONTROLLER, SEAPORT, SeaportAbi } from "@/config/seaport";
import { deployment } from "@/config/contracts";

/**
 * Ask the chain whether the two addresses everything is approved to are what
 * this build says they are.
 *
 * Both were trusted for one reason only: they are typed correctly in a config
 * file. `SEAPORT` is the operator in every `setApprovalForAll`, the spender in
 * every WSOSO `approve`, and the destination of every `value` a buyer sends.
 * `wsoso` is worse — it is simultaneously the token bidders `deposit()` into
 * and the whitelist `unsafeReason` checks a bid's currency against, so one
 * wrong literal fails in both directions at once: bidders fund an attacker's
 * contract, and the "absolute, not relative" counterfeit-currency defence now
 * points at the attacker's token.
 *
 * A bad merge, a compromised dependency or a hostile PR is enough. Nothing in
 * the running app checked either one — `verify-seaport-bytecode.mjs` is an
 * offline script that the site never executes.
 *
 * None of this defends against a wholly substituted frontend, which can delete
 * this file. It defends against the narrower and far likelier case of one
 * wrong constant reaching production, and it converts two addresses from
 * *asserted* into *verified*.
 */

export interface ContractIdentity {
  ok: boolean;
  /** Human-readable, one per failed check. Empty when everything matched. */
  problems: string[];
}

const EXPECTED_SEAPORT_VERSION = "1.6";
const EXPECTED_WSOSO_SYMBOL = "WSOSO";
const EXPECTED_WSOSO_DECIMALS = 18;

export function useVerifiedContracts() {
  const client = usePublicClient();

  const query = useQuery<ContractIdentity>({
    queryKey: ["contract-identity", SEAPORT, deployment.wsoso],
    enabled: client !== undefined,
    // Addresses do not change under a running tab, and a wrong one is not
    // going to become right. Ask once.
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<ContractIdentity> => {
      const wsoso = deployment.wsoso as Address;

      const [info, code, symbol, decimals] = await Promise.all([
        client!.readContract({ address: SEAPORT, abi: SeaportAbi, functionName: "information" }),
        client!.getBytecode({ address: wsoso }),
        client!.readContract({ address: wsoso, abi: erc20Abi, functionName: "symbol" }),
        client!.readContract({ address: wsoso, abi: erc20Abi, functionName: "decimals" }),
      ]);

      const [version, , conduitController] = info as readonly [string, `0x${string}`, Address];

      const problems: string[] = [];

      if (version !== EXPECTED_SEAPORT_VERSION) {
        problems.push(`Seaport reports version ${version}, not ${EXPECTED_SEAPORT_VERSION}.`);
      }
      if (conduitController.toLowerCase() !== CONDUIT_CONTROLLER.toLowerCase()) {
        problems.push("Seaport names a ConduitController this app does not know.");
      }
      if (code === undefined || code === "0x") {
        problems.push("The WSOSO address has no contract code.");
      }
      if (symbol !== EXPECTED_WSOSO_SYMBOL) {
        problems.push(`The settlement token reports symbol ${String(symbol)}, not WSOSO.`);
      }
      if (Number(decimals) !== EXPECTED_WSOSO_DECIMALS) {
        problems.push(`The settlement token reports ${String(decimals)} decimals, not 18.`);
      }

      return { ok: problems.length === 0, problems };
    },
  });

  return {
    /**
     * True only once the chain has actually confirmed both addresses.
     *
     * Deliberately false while loading and false on error. A check that passes
     * when it could not run is not a check — and the thing it gates is granting
     * an operator blanket rights over a collection.
     */
    verified: query.data?.ok === true,
    /** True when the chain answered and disagreed. Distinct from "not asked yet". */
    mismatch: query.data !== undefined && query.data.ok === false,
    problems: query.data?.problems ?? [],
    isLoading: query.isLoading,
    /** The chain could not be reached; identity is unknown, not wrong. */
    unknown: query.isError,
  };
}
