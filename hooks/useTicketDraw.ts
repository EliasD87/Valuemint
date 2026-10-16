"use client";

import { parseAbi, type Hex } from "viem";
import { useReadContracts } from "wagmi";

/**
 * A TicketDraw contract's state (contracts/TicketDraw.sol): the locked list,
 * the draw block, and the winners once drawn. Read in one batch; polling stops
 * once the draw is done, because nothing in the contract can change after that.
 */

const ABI = parseAbi([
  "function walletCount() view returns (uint256)",
  "function totalTickets() view returns (uint256)",
  "function drawBlock() view returns (uint64)",
  "function winners() view returns (uint32)",
  "function drawn() view returns (bool)",
  "function seed() view returns (bytes32)",
  "function numberSeed() view returns (bytes32)",
  "function entries(uint256 start, uint256 count) view returns (address[] wallets, uint256[] ends)",
  "function results() view returns (address[] wallets, uint256[] tickets, uint256[] attempts)",
]);

/** Far more than any list here; one call reads it all (471 wallets in the 2026-10-16 dry run). */
const READ_ALL = 5_000n;

export interface TicketDrawState {
  wallets: number;
  tickets: number;
  /** Zero until the list is locked. */
  drawBlock: bigint;
  winners: number;
  drawn: boolean;
  /** Zero hash until the first draw call. */
  seed: Hex;
  /** Zero hash until the list is sealed and numbered: it shuffles places into ticket numbers. */
  numberSeed: Hex;
  entries: { wallet: string; end: number }[];
  results: { wallet: string; ticket: number; attempt: number }[];
}

export function useTicketDraw(address: `0x${string}` | "") {
  const enabled = address !== "";
  const c = { address: address as `0x${string}`, abi: ABI } as const;
  const q = useReadContracts({
    contracts: [
      { ...c, functionName: "walletCount" },
      { ...c, functionName: "totalTickets" },
      { ...c, functionName: "drawBlock" },
      { ...c, functionName: "winners" },
      { ...c, functionName: "drawn" },
      { ...c, functionName: "seed" },
      { ...c, functionName: "entries", args: [0n, READ_ALL] },
      { ...c, functionName: "results" },
      { ...c, functionName: "numberSeed" },
    ],
    allowFailure: false,
    query: {
      enabled,
      refetchInterval: (query) => ((query.state.data as unknown[] | undefined)?.[4] === true ? false : 15_000),
    },
  });

  let state: TicketDrawState | undefined;
  if (q.data !== undefined) {
    const [wallets, tickets, drawBlock, winners, drawn, seed, [ws, ends], [rw, rt, ra], numberSeed] = q.data;
    state = {
      wallets: Number(wallets),
      tickets: Number(tickets),
      drawBlock,
      winners: Number(winners),
      drawn,
      seed,
      numberSeed,
      entries: ws.map((w, i) => ({ wallet: w.toLowerCase(), end: Number(ends[i]) })),
      results: rw.map((w, i) => ({ wallet: w, ticket: Number(rt[i]), attempt: Number(ra[i]) })),
    };
  }
  return { enabled, state, error: q.error };
}
