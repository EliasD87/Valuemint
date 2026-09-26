import "server-only";
import { createPublicClient, fallback, http, keccak256, numberToHex, parseAbi, toBytes, type Address } from "viem";
import { RPC_HTTP, valuechain } from "@/config/chain";
import { criteriaTree, type CriteriaTree } from "@/lib/criteria";
import { isFilterable } from "@/lib/traitRoles";
import { tokenDocument, tokenIdsOf } from "@/lib/tokenDocument";

/**
 * The token sets trait offers are made over: for one collection, every piece
 * with each trait value, and the Merkle tree of each set.
 *
 * **What a set may contain decides what a buyer can end up holding.** A trait
 * offer's root is fixed when it is made, and Seaport lets exactly the tokens in
 * the tree be sold into it — a buyer bidding on "Level: Uncommon" must never be
 * sold a Common. So a token is in a set only when its document was composed and
 * carries exactly that trait value. A token whose document could not be read is
 * left OUT: an offer may cover fewer pieces than it could have, never a piece
 * it should not.
 *
 * **Two sources, both deterministic** — the same set must come out every time,
 * or nobody viewing an offer could recognise its root:
 *
 * - Collections whose metadata this site composes (`tokenIdsOf`): every
 *   collection created here, The Trenches, the KOLs, Trade Buddies. Traits are
 *   computed from a pinned manifest or from config.
 * - Collections whose trait is stored ON CHAIN (`LEVEL_SOURCES`): SoDEX's
 *   Treasure Box keeps each box's Level in the contract, written once at mint
 *   and never changed. Read from the chain, not from SoDEX's metadata host,
 *   which answers 501 and on 2026-09-25 had every Level empty.
 *
 * Anything else (Cybereator, whose traits live only on SoDEX's server) gets no
 * trait offers: a set built from a host that can change its answer is a guess.
 */

export interface TraitSet {
  traitType: string;
  value: string;
  tree: CriteriaTree;
  /** On a growing collection, the highest token id the set covers (see `saltWithBound`). */
  bound?: bigint;
}

export interface TraitSets {
  sets: TraitSet[];
  /** On a growing collection, the bound the current sets were built at. */
  bound?: bigint;
}

const client = createPublicClient({
  chain: valuechain,
  transport: fallback(
    RPC_HTTP.map((url) => http(url, { timeout: 10_000 })),
    { rank: false },
  ),
});

const ABI = parseAbi([
  "function baseURI() view returns (string)",
  "function tokenURI(uint256) view returns (string)",
]);

/** `https://www.valuemint.store/api/metadata/<key>/…` → key. */
const OURS = /^https:\/\/(?:www\.)?valuemint\.store\/api\/metadata\/([^/?#]+)\/?/;

/**
 * Which of this site's metadata sources a contract points at, or undefined.
 *
 * `baseURI()` first — the factory's collections and The Trenches have it —
 * then `tokenURI(1)` for older contracts that do not (ValueChain Genesis).
 */
export async function metadataKeyOf(collection: Address): Promise<string | undefined> {
  const read = async (fn: "baseURI" | "tokenURI") => {
    try {
      return (await client.readContract({
        address: collection,
        abi: ABI,
        functionName: fn,
        args: fn === "tokenURI" ? [1n] : [],
      } as never)) as string;
    } catch {
      return undefined;
    }
  };
  for (const fn of ["baseURI", "tokenURI"] as const) {
    const uri = await read(fn);
    const key = uri === undefined ? undefined : OURS.exec(uri)?.[1];
    if (key !== undefined) return key;
  }
  return undefined;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; sets: TraitSet[] | undefined }>();

/**
 * Every trait set for a collection, or undefined where trait offers are not
 * supported.
 *
 * `bound` asks for a growing collection's sets as they were at that token id —
 * how an offer made earlier is recognised after more pieces were minted. It is
 * ignored for collections that do not grow, and a bound past what has been
 * minted gets nothing: an unminted id reads as level 0, and a set that counted
 * it as Common would be a claim about a box that does not exist yet.
 */
export async function traitSetsOf(collection: Address, bound?: bigint): Promise<TraitSets | undefined> {
  const source = LEVEL_SOURCES[collection.toLowerCase()];
  if (source !== undefined) return levelSetsOf(collection, source, bound);

  const k = collection.toLowerCase();
  const hit = cache.get(k);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.sets === undefined ? undefined : { sets: hit.sets };

  const sets = await build(collection);
  cache.set(k, { at: Date.now(), sets });
  return sets === undefined ? undefined : { sets };
}

// ------------------------------------------------------------ on-chain levels

interface LevelSource {
  traitType: string;
  /** Index = the level the contract stores; value = the metadata's own spelling. */
  values: readonly string[];
}

/**
 * SoDEX Treasure Box: `enum BoxLevel { Common, Uncommon, Rare, SuperRare }`,
 * two bits per box in `packedBoxLevels(id >> 7)`. `_setLevel` is called only
 * from `_mintBoxes` and `_executeMerge`, each time on a freshly minted id, so a
 * box's level never changes; merging burns the inputs and mints a new box.
 * The spellings match SoDEX's metadata ("SuperRare", one word), so an offer
 * reads the same as the trait filter beside it.
 *
 * The contract is upgradeable by SoDEX. An upgrade that rewrote levels would
 * change the rebuilt sets and older offers would stop being recognised, and
 * `mintedUpTo` refuses outright if the storage it reads stops adding up.
 */
const LEVEL_SOURCES: Record<string, LevelSource> = {
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750": {
    traitType: "Level",
    values: ["Common", "Uncommon", "Rare", "SuperRare"],
  },
};

const LEVEL_ABI = parseAbi([
  "function packedBoxLevels(uint256 wordIndex) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

/** ERC721A (upgradeable) keeps `_currentIndex` and `_burnCounter` in its first two words here. */
const ERC721A_SLOT = BigInt(keccak256(toBytes("ERC721A.contracts.storage.ERC721A")));

/**
 * The highest id minted so far. The contract exposes no `nextTokenId`, so it
 * is read from ERC721A's storage — and checked: `_currentIndex - _burnCounter
 * - 1` must equal `totalSupply()`, or the layout is not what this assumes and
 * nothing is built.
 */
async function mintedUpTo(collection: Address): Promise<bigint> {
  const [index, burned, supply] = await Promise.all([
    client.getStorageAt({ address: collection, slot: numberToHex(ERC721A_SLOT, { size: 32 }) }),
    client.getStorageAt({ address: collection, slot: numberToHex(ERC721A_SLOT + 1n, { size: 32 }) }),
    client.readContract({ address: collection, abi: LEVEL_ABI, functionName: "totalSupply" }),
  ]);
  const next = BigInt(index ?? "0x0");
  if (next === 0n || next - BigInt(burned ?? "0x0") - 1n !== supply) {
    throw new Error("Level storage no longer matches ERC721A; refusing to build level sets.");
  }
  return next - 1n;
}

/** Packed level words that are complete — every id in them minted — never change. */
const settledWords = new Map<string, bigint>();

async function levelWords(collection: Address, bound: bigint, minted: bigint): Promise<bigint[]> {
  const last = Number(bound >> 7n);
  const key = (w: number) => `${collection.toLowerCase()}:${w}`;
  const missing: number[] = [];
  for (let w = 0; w <= last; w++) if (!settledWords.has(key(w))) missing.push(w);

  const read =
    missing.length === 0
      ? []
      : await client.multicall({
          contracts: missing.map((w) => ({
            address: collection,
            abi: LEVEL_ABI,
            functionName: "packedBoxLevels" as const,
            args: [BigInt(w)] as const,
          })),
          allowFailure: false,
          batchSize: 8192,
        });

  const fresh = new Map<number, bigint>();
  missing.forEach((w, i) => {
    const word = read[i] as bigint;
    fresh.set(w, word);
    if (BigInt(w) * 128n + 127n <= minted) settledWords.set(key(w), word);
  });
  return Array.from({ length: last + 1 }, (_, w) => fresh.get(w) ?? settledWords.get(key(w))!);
}

/** The bound the current sets are built at, re-read every TTL. */
const currentBound = new Map<string, { at: number; bound: bigint }>();

/** Sets at a given bound never change, so they are kept — only a few, they are large. */
const atBound = new Map<string, Promise<TraitSet[]>>();
const AT_BOUND_KEPT = 6;

async function levelSetsOf(collection: Address, source: LevelSource, bound?: bigint): Promise<TraitSets> {
  const c = collection.toLowerCase();
  let now = currentBound.get(c);
  if (now === undefined || Date.now() - now.at >= TTL_MS) {
    now = { at: Date.now(), bound: await mintedUpTo(collection) };
    currentBound.set(c, now);
  }

  const target = bound ?? now.bound;
  if (target < 1n || target > now.bound) return { sets: [], bound: now.bound };

  const k = `${c}:${target}`;
  let pending = atBound.get(k);
  if (pending === undefined) {
    pending = buildLevels(collection, source, target, now.bound);
    atBound.set(k, pending);
    pending.catch(() => atBound.delete(k));
    while (atBound.size > AT_BOUND_KEPT) atBound.delete(atBound.keys().next().value!);
  }
  return { sets: await pending, bound: now.bound };
}

async function buildLevels(
  collection: Address,
  source: LevelSource,
  bound: bigint,
  minted: bigint,
): Promise<TraitSet[]> {
  const words = await levelWords(collection, bound, minted);
  const groups: bigint[][] = source.values.map(() => []);
  /* Token ids start at 1. Burned boxes stay in: a burned id can never be
     transferred again or minted twice, so it can never fill an offer. */
  for (let id = 1n; id <= bound; id++) {
    const level = Number((words[Number(id >> 7n)]! >> ((id & 127n) * 2n)) & 3n);
    groups[level]?.push(id);
  }
  return source.values.flatMap((value, i) =>
    groups[i]!.length === 0 ? [] : [{ traitType: source.traitType, value, tree: criteriaTree(groups[i]!), bound }],
  );
}

async function build(collection: Address): Promise<TraitSet[] | undefined> {
  const key = await metadataKeyOf(collection);
  if (key === undefined) return undefined;
  const ids = await tokenIdsOf(key);
  if (ids === undefined || ids.length === 0) return undefined;

  const groups = new Map<string, { traitType: string; value: string; ids: bigint[] }>();
  for (const id of ids) {
    const result = await tokenDocument(key, id);
    if (!result.ok) continue;
    const attributes = (result.document as { attributes?: unknown }).attributes;
    if (!Array.isArray(attributes)) continue;

    for (const a of attributes as Array<{ trait_type?: unknown; value?: unknown }>) {
      if (typeof a.trait_type !== "string" || !isFilterable(a.trait_type)) continue;
      if (a.value === undefined || a.value === null || String(a.value) === "") continue;
      const value = String(a.value);
      const g = `${a.trait_type}\u0000${value}`;
      const group = groups.get(g) ?? { traitType: a.trait_type, value, ids: [] };
      group.ids.push(BigInt(id));
      groups.set(g, group);
    }
  }

  return [...groups.values()]
    .map((g) => ({ traitType: g.traitType, value: g.value, tree: criteriaTree(g.ids) }))
    .sort((a, b) => a.traitType.localeCompare(b.traitType) || a.value.localeCompare(b.value));
}
