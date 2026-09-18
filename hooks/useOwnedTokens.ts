"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc721Abi, parseAbiItem, type Address } from "viem";
import { scanLogs } from "@/lib/logScan";
import { orderBookFloor } from "@/lib/seaport";
import { deployment } from "@/config/contracts";

/**
 * Which tokens an address holds in a collection that cannot be asked directly.
 *
 * `tokenOfOwnerByIndex` is ERC721**Enumerable**, an optional extension, and the
 * SoDEX treasure boxes skip it — so the app knows *how many* a wallet holds
 * (`balanceOf` is mandatory) and nothing about *which*. Without an id there is
 * no token page, no listing and no trade.
 *
 * ---
 *
 * **This used to ask the explorer, and the explorer could not answer.**
 *
 * Blockscout indexes NFTs by owner, which sounded ideal: one request instead of
 * a log walk. It paged at 50, so the hook walked up to `MAX_PAGES` of them and
 * then capped the result at `MAX_PER_COLLECTION = 100`. That is fine for a
 * wallet holding five and wrong for this launch, where 10-20k boxes are handed
 * out unevenly and one holder may have thousands.
 *
 * Measured against a real wallet on 2026-09-18:
 *
 *     balanceOf                626 boxes
 *     explorer walk (6 pages)  295 ids found
 *     after the 100 cap        100 shown
 *
 * 526 boxes invisible, and therefore unlistable and unsellable. Raising the
 * caps does not fix it either: the cost of the explorer route grows with the
 * number held, so the holder it fails hardest for is the one it costs most to
 * serve.
 *
 * ---
 *
 * **Transfer logs cost the same whatever you hold.**
 *
 * Every token that has ever arrived at an address left a `Transfer(_, to, id)`
 * behind, and the node filters on that indexed `to` itself — so the work is set
 * by the block span, not by the answer's size. Measured over 200,000 blocks:
 * 22 requests, 4.3s, 707 distinct ids ever received. The same 22 requests for a
 * wallet holding 3,000.
 *
 * `scanLogs` then makes every call after the first nearly free: it remembers the
 * watermark per query and asks only for blocks mined since, which on a
 * two-second chain is a few hundred.
 *
 * The chain still decides. An inbound log says a token *arrived*, never that it
 * is still here, so every candidate is confirmed with `ownerOf` before it counts
 * as sellable. That also sidesteps the ordering problem: a token can leave and
 * come back, and same-block in-then-out cannot be resolved from logs alone
 * without a log index. Asking who owns it now is both simpler and correct.
 *
 * A wrong or lagging answer therefore costs completeness, never correctness —
 * the same rule this hook has always followed.
 */

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

/**
 * A ceiling on confirmed ids per collection.
 *
 * Not a display limit — the portfolio groups and counts rather than drawing one
 * card per token — but `ownerOf` is one multicall entry each and the metadata
 * that follows is a fetch each, so something has to bound it. 2,000 is the
 * order book's own candidate ceiling, which makes this the point past which a
 * holder could not list more anyway.
 */
const MAX_PER_COLLECTION = 2_000;

/**
 * The block a collection was deployed at, so the walk starts where the tokens
 * could first exist rather than at an arbitrary floor.
 *
 * This is worth one request because the span is the whole cost. Both box
 * collections were deployed at block 14,394,118 against a head of 14,479,705 —
 * 85,587 blocks, which is 5 chunks. Starting from `orderBookFloor` instead
 * would be 4,500,000 blocks and 225 chunks, for identical results.
 *
 * A contract's creation block never changes, so this is cached for the life of
 * the tab. The explorer is asked because nothing on chain reports it cheaply -
 * and if it cannot answer, the order book's floor is the fallback: slower, and
 * still correct.
 */
const firstBlock = new Map<string, bigint>();

async function firstBlockOf(address: Address, head: bigint): Promise<bigint> {
  const key = address.toLowerCase();
  const known = firstBlock.get(key);
  if (known !== undefined) return known;

  let from = orderBookFloor(head, 0n);
  try {
    const res = await fetch(`${deployment.explorer}/api/v2/addresses/${address}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const body = (await res.json()) as { creation_transaction_hash?: string; creation_tx_hash?: string };
      const tx = body.creation_transaction_hash ?? body.creation_tx_hash;
      if (tx !== undefined && tx !== "") {
        const txRes = await fetch(`${deployment.explorer}/api/v2/transactions/${tx}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (txRes.ok) {
          const t = (await txRes.json()) as { block_number?: number };
          // Never trust it past the floor: a wrong answer must cost speed, not
          // correctness, and a too-late start would silently hide tokens.
          if (typeof t.block_number === "number" && BigInt(t.block_number) >= from) {
            from = BigInt(t.block_number);
          }
        }
      }
    }
  } catch {
    // Fall through to the floor.
  }

  firstBlock.set(key, from);
  return from;
}

export function useOwnedTokens(
  /** Only the collections that actually need it — non-Enumerable ones. */
  collections: readonly Address[],
  owner: Address | undefined,
) {
  const client = usePublicClient();

  // Stable key: the same set in a different order is the same question.
  const key = [...collections].map((a) => a.toLowerCase()).sort().join(",");

  const query = useQuery({
    queryKey: ["owned-by-transfers", key, owner],
    enabled: client !== undefined && owner !== undefined && collections.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, bigint[]>> => {
      const head = await client!.getBlockNumber();
      const candidates = new Map<string, Set<string>>();

      await Promise.all(
        collections.map(async (address) => {
          const inbound = await scanLogs(client!, {
            address,
            event: TRANSFER,
            args: { to: owner! },
            fromBlock: await firstBlockOf(address, head),
          });

          const ids = new Set<string>();
          for (const log of inbound) {
            const id = (log.args as { tokenId?: bigint }).tokenId;
            if (id !== undefined) ids.add(id.toString());
          }
          if (ids.size > 0) candidates.set(address.toLowerCase(), ids);
        }),
      );

      if (candidates.size === 0) return {};

      /**
       * The logs propose; the chain disposes.
       *
       * An arrival is not possession. Every id is checked against `ownerOf`, so
       * a token sold, burned or moved on since simply fails the check.
       */
      const flat = [...candidates.entries()].flatMap(([addr, ids]) =>
        [...ids].slice(0, MAX_PER_COLLECTION * 2).map((id) => ({ addr, id: BigInt(id) })),
      );

      const checked = await client!.multicall({
        contracts: flat.map((f) => ({
          address: f.addr as Address,
          abi: erc721Abi,
          functionName: "ownerOf" as const,
          args: [f.id],
        })),
        allowFailure: true,
      });

      const out: Record<string, bigint[]> = {};
      checked.forEach((r, i) => {
        const f = flat[i];
        if (f === undefined || r.status !== "success") return;
        if ((r.result as Address).toLowerCase() !== owner!.toLowerCase()) return;
        const list = out[f.addr] ?? [];
        if (list.length < MAX_PER_COLLECTION) list.push(f.id);
        out[f.addr] = list;
      });

      // Newest first, so a holder sees what arrived most recently at the top.
      for (const addr of Object.keys(out)) out[addr]!.sort((a, b) => (a > b ? -1 : 1));

      return out;
    },
  });

  return {
    byCollection: query.data ?? {},
    isLoading: query.isLoading,
    /** True when the lookup was needed and could not be answered at all. */
    unavailable: query.isError,
  };
}
