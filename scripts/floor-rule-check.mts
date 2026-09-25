/**
 * Read-only: the floor each collection would get under the new snapshot rule
 * (readOrder + resolveFillable, as lib/indexSync.ts now does), beside the floor
 * the old rule recorded for the current hour. Writes nothing.
 *
 *   ../contracts/node_modules/.bin/tsx --tsconfig tsconfig.json scripts/floor-rule-check.ts
 */
import { createPublicClient, erc721Abi, http, type Address } from "viem";
import { valuechain } from "@/config/chain";
import { SEAPORT } from "@/config/seaport";
import { ItemType, readOrder, resolveFillable, type ChainAnswer } from "@/lib/seaport";
import { decodeParams, type JsonOrderParameters } from "@/lib/indexRows";

const SITE = "https://www.valuemint.store";
const client = createPublicClient({ chain: valuechain, transport: http("https://mainnet.valuechain.xyz") });
const ERC1155_BALANCE = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

interface Book {
  orders: Array<{ params: JsonOrderParameters; blockNumber?: number; block_number?: number }>;
  counters?: Array<{ offerer: string; voidedAfterBlock?: number; voided_after_block?: number }>;
}

const book = (await (await fetch(`${SITE}/api/index/orders`)).json()) as Book;
const now = BigInt(Math.floor(Date.now() / 1000));
const voided = new Map(
  (book.counters ?? []).map((c) => [c.offerer.toLowerCase(), BigInt(c.voidedAfterBlock ?? c.voided_after_block ?? 0)]),
);

const listings = book.orders.flatMap((row) => {
  const params = decodeParams(row.params);
  const order = readOrder(params);
  if (order === undefined || order.kind !== "listing" || order.tokenId === undefined) return [];
  if (params.endTime !== 0n && params.endTime <= now) return [];
  const v = voided.get(order.maker.toLowerCase());
  const block = BigInt(row.blockNumber ?? row.block_number ?? 0);
  if (v !== undefined && block < v) return [];
  return [{ order, params, tokenId: order.tokenId }];
});

const answers = await client.multicall({
  allowFailure: true,
  contracts: listings.flatMap(({ order, params, tokenId }) => [
    params.offer[0]?.itemType === ItemType.ERC1155
      ? { address: order.collection, abi: ERC1155_BALANCE, functionName: "balanceOf" as const, args: [order.maker, tokenId] as const }
      : { address: order.collection, abi: erc721Abi, functionName: "ownerOf" as const, args: [tokenId] as const },
    { address: order.collection, abi: erc721Abi, functionName: "isApprovedForAll" as const, args: [order.maker, SEAPORT] as const },
  ]),
});

const floors = new Map<string, { floor: bigint; tokens: Set<string>; dropped: number }>();
listings.forEach(({ order, params, tokenId }, i) => {
  const key = order.collection.toLowerCase();
  const f = floors.get(key) ?? { floor: -1n, tokens: new Set<string>(), dropped: 0 };
  const ok = resolveFillable({ ...order, params }, { first: answers[i * 2] as ChainAnswer, second: answers[i * 2 + 1] as ChainAnswer });
  if (!ok) f.dropped++;
  else {
    if (f.floor < 0n || order.priceWei < f.floor) f.floor = order.priceWei;
    f.tokens.add(tokenId.toString());
  }
  floors.set(key, f);
});

const soso = (w: bigint) => (Number(w / 10n ** 14n) / 1e4).toString();
console.log(`orders in book ${book.orders.length}; well-formed live listings ${listings.length}\n`);
console.log("collection                                   new floor  listed  unfillable  | old-rule floor this hour");
for (const [c, f] of floors) {
  const hist = (await (await fetch(`${SITE}/api/index/floors?collection=${c}&days=1`)).json()) as { points: Array<{ floorWei: string | null }> };
  const last = hist.points.at(-1)?.floorWei;
  const oldFloor = last === null || last === undefined ? "—" : soso(BigInt(last));
  const newFloor = f.floor < 0n ? "—" : soso(f.floor);
  console.log(`${c}  ${newFloor.padStart(9)}  ${String(f.tokens.size).padStart(6)}  ${String(f.dropped).padStart(10)}  | ${oldFloor}${oldFloor !== newFloor ? "   <-- differs" : ""}`);
}
void (null as unknown as Address);
