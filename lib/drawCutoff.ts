import { parseAbiItem, type PublicClient } from "viem";

/**
 * The first Treasure Box minted after a snapshot, read off the chain
 * (2026-10-28).
 *
 * Box ids are minted in order, so "minted after the snapshot" is every id at
 * or above the first one minted after it. That first id is found in two
 * steps: the first block at or after the snapshot's time, then the first mint
 * (a `Transfer` from the zero address) at or after that block.
 *
 * Checked against the first draw's cut-off, worked out by hand on 2026-10-20:
 * snapshot 12:00:00 UTC -> block 15,845,641 -> box #102,862.
 */

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

/** ValueChain's block time, used only to aim the search; the answer is exact. */
const BLOCK_SECONDS = 2.04;

/** Under the node's measured `eth_getLogs` range cap (~29,793), with room. */
const LOG_CHUNK = 10_000n;

/** The first block whose timestamp is at or after `at`. */
export async function firstBlockAtOrAfter(client: PublicClient, at: Date): Promise<bigint> {
  const target = BigInt(Math.floor(at.getTime() / 1000));
  const head = await client.getBlock({ blockTag: "latest" });
  if (head.timestamp < target) return head.number + 1n;

  /* Aim by block time, then bracket and bisect: a handful of reads. */
  let guess = head.number - BigInt(Math.ceil(Number(head.timestamp - target) / BLOCK_SECONDS));
  if (guess < 0n) guess = 0n;
  let lo = guess > 2_000n ? guess - 2_000n : 0n;
  let hi = guess + 2_000n > head.number ? head.number : guess + 2_000n;
  /* Widen until the answer is inside [lo, hi]. */
  while (lo > 0n && (await client.getBlock({ blockNumber: lo })).timestamp >= target) lo = lo > 20_000n ? lo - 20_000n : 0n;
  while (hi < head.number && (await client.getBlock({ blockNumber: hi })).timestamp < target) hi = hi + 20_000n > head.number ? head.number : hi + 20_000n;

  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if ((await client.getBlock({ blockNumber: mid })).timestamp >= target) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/**
 * The lowest id minted at or after `fromBlock`, or undefined if nothing has
 * been minted since. Walks forward in chunks and stops at the first chunk
 * with a mint in it; mints are frequent, so that is normally the first.
 */
export async function firstMintFrom(
  client: PublicClient,
  collection: `0x${string}`,
  fromBlock: bigint,
): Promise<{ tokenId: bigint; block: bigint } | undefined> {
  const head = await client.getBlockNumber();
  for (let start = fromBlock; start <= head; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n > head ? head : start + LOG_CHUNK - 1n;
    const logs = await client.getLogs({
      address: collection,
      event: TRANSFER,
      args: { from: "0x0000000000000000000000000000000000000000" },
      fromBlock: start,
      toBlock: end,
    });
    let best: { tokenId: bigint; block: bigint } | undefined;
    for (const log of logs) {
      const id = log.args.tokenId;
      if (id === undefined) continue;
      if (best === undefined || id < best.tokenId) best = { tokenId: id, block: log.blockNumber };
    }
    if (best !== undefined) return best;
  }
  return undefined;
}
