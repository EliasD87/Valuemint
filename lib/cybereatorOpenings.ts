import "server-only";
import { numberToHex, type Hex, type PublicClient } from "viem";
import { CYBEREATOR_OPENER, CYBEREATOR_TOPICS } from "@/lib/cybereator";

/**
 * Every Cybereator opening, read from the opener contract's `Opened` logs.
 *
 * `Opened(uint256 indexed tokenId, address indexed owner, uint256 openBlock,
 * uint256 openIndex, uint256 epoch)`: the chain's own record of which piece
 * was opened, and in what order. `openIndex` counts from 0 and is the same
 * number cybereator.com's gallery and metadata carry (`open_index`), checked
 * for all 268 openings on 2026-11-10.
 *
 * An opening is permanent, so what has been read is kept and each call only
 * reads the blocks since the last one.
 */

export interface Opening {
  id: bigint;
  index: number;
}

/** Before the opener's first log (block 16,733,828, 2026-11-10); nothing earlier can exist. */
const FROM_BLOCK = 16_730_000n;

/** Under the node's measured ~29,800-block cap per request. */
const CHUNK = 20_000n;

interface RawLog {
  topics: Hex[];
  data: Hex;
}

let known: { to: bigint; openings: Map<string, Opening> } = { to: FROM_BLOCK - 1n, openings: new Map() };
let pending: Promise<Opening[]> | undefined;

/** Decode one `Opened` log; undefined for anything malformed. */
export function decodeOpened(log: RawLog): Opening | undefined {
  const topic = log.topics[1];
  if (topic === undefined || log.data.length < 2 + 64 * 2) return undefined;
  const index = BigInt(`0x${log.data.slice(2 + 64, 2 + 128)}`);
  if (index > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return { id: BigInt(topic), index: Number(index) };
}

/**
 * All openings up to `toBlock`. Pass a block a few behind the head: the node
 * refuses a range that ends on a block it has not finished (-32014).
 */
export function readOpenings(client: PublicClient, toBlock: bigint): Promise<Opening[]> {
  pending ??= (async () => {
    try {
      const openings = new Map(known.openings);
      for (let from = known.to + 1n; from <= toBlock; from += CHUNK) {
        const to = from + CHUNK - 1n > toBlock ? toBlock : from + CHUNK - 1n;
        const logs = (await client.request({
          method: "eth_getLogs",
          params: [
            {
              address: CYBEREATOR_OPENER as Hex,
              fromBlock: numberToHex(from),
              toBlock: numberToHex(to),
              topics: [CYBEREATOR_TOPICS.opened],
            },
          ],
        } as never)) as RawLog[];
        for (const log of logs) {
          const o = decodeOpened(log);
          if (o !== undefined) openings.set(o.id.toString(), o);
        }
      }
      if (toBlock > known.to) known = { to: toBlock, openings };
      return [...known.openings.values()];
    } finally {
      pending = undefined;
    }
  })();
  return pending;
}
