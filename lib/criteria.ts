import { bytesToHex, keccak256, numberToBytes, type Hex } from "viem";

/**
 * Merkle trees in the exact form Seaport 1.6 checks, for offers on a SET of
 * tokens — every piece with one trait — rather than one token or all of them.
 *
 * A Seaport criteria item carries a root in `identifierOrCriteria`. Zero means
 * "any token in the contract"; anything else is the root of a tree of token
 * ids, and whoever fills the order must prove their token is a leaf.
 * `CriteriaResolution._verifyProof` in Seaport does:
 *
 *   leaf  = keccak256(tokenId as one 32-byte word)
 *   node  = keccak256(smaller || larger)   — each pair sorted before hashing
 *
 * so this builds trees the same way, and `contracts/test` settles an order
 * against Seaport's real bytecode using proofs made here. A tree that differs
 * by one byte would make every trait offer impossible to accept.
 */

/** Seaport's leaf for a token id. */
export function leafOf(id: bigint): Uint8Array {
  return keccak256(numberToBytes(id, { size: 32 }), "bytes");
}

/** Big-endian byte order is numeric order, which is what Seaport compares. */
function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [lo, hi] = compare(a, b) <= 0 ? [a, b] : [b, a];
  const buf = new Uint8Array(64);
  buf.set(lo, 0);
  buf.set(hi, 32);
  return keccak256(buf, "bytes");
}

export interface CriteriaTree {
  /** The value that goes in `identifierOrCriteria`, as hex. */
  root: Hex;
  /** How many distinct tokens the tree covers. */
  size: number;
  /** Whether `id` is in the set. */
  has(id: bigint): boolean;
  /** The proof for `id`, or undefined when it is not in the set. */
  proof(id: bigint): Hex[] | undefined;
}

/**
 * A tree over a set of token ids. Order and duplicates in the input do not
 * matter: leaves are sorted by their hash, so the same set always gives the
 * same root — which is what lets a viewer recognise an offer made by someone
 * else from the set alone.
 */
export function criteriaTree(ids: Iterable<bigint>): CriteriaTree {
  const unique = [...new Set([...ids].map((i) => i.toString()))].map((s) => BigInt(s));
  if (unique.length === 0) throw new Error("A criteria tree needs at least one token.");

  const leaves = unique.map((id) => ({ id, leaf: leafOf(id) })).sort((a, b) => compare(a.leaf, b.leaf));
  const position = new Map(leaves.map((l, i) => [l.id.toString(), i]));

  /** Each layer pairs the one below; an odd node out is carried up unchanged. */
  const layers: Uint8Array[][] = [leaves.map((l) => l.leaf)];
  while (layers[layers.length - 1]!.length > 1) {
    const below = layers[layers.length - 1]!;
    const above: Uint8Array[] = [];
    for (let i = 0; i < below.length; i += 2) {
      above.push(i + 1 < below.length ? hashPair(below[i]!, below[i + 1]!) : below[i]!);
    }
    layers.push(above);
  }

  return {
    root: bytesToHex(layers[layers.length - 1]![0]!),
    size: leaves.length,
    has: (id) => position.has(id.toString()),
    proof(id) {
      let i = position.get(id.toString());
      if (i === undefined) return undefined;
      const out: Hex[] = [];
      for (let level = 0; level < layers.length - 1; level++) {
        const layer = layers[level]!;
        const sibling = i ^ 1;
        if (sibling < layer.length) out.push(bytesToHex(layer[sibling]!));
        i >>= 1;
      }
      return out;
    },
  };
}

/** What Seaport does with a proof — for tests and for checking before sending. */
export function verifyProof(id: bigint, root: Hex, proof: readonly Hex[]): boolean {
  let computed = leafOf(id);
  for (const p of proof) {
    const sibling = numberToBytes(BigInt(p), { size: 32 });
    computed = hashPair(computed, sibling);
  }
  return bytesToHex(computed) === root.toLowerCase();
}

/**
 * Where a trait offer on a GROWING collection records how far its set goes.
 *
 * SoDEX's Treasure Box mints new boxes all the time (merging burns boxes and
 * mints a new one), so "every Uncommon box" is a different set, with a
 * different root, every few minutes. A root alone would stop being recognised
 * the moment the next box was minted, and the offer would vanish from every
 * screen while still live on chain. So the offer carries its bound: its set is
 * exactly the boxes numbered 1 to `bound` with that level, which never changes
 * because a box's level is fixed when it is minted.
 *
 * The bound lives in the order's salt, which Seaport treats as opaque:
 *
 *   bits 224–255  tag "VMB1"   — marks a salt that carries a bound
 *   bits 160–223  bound        — the highest token id in the set
 *   bits   0–159  random       — what the salt is for: distinct order hashes
 *
 * It is a claim, not a proof. The site rebuilds the set at that bound from the
 * chain and names the offer only when the rebuilt root equals the order's
 * root, so a maker who writes a false bound gets an offer nobody is shown.
 */
const BOUND_TAG = 0x564d4231n; // "VMB1"
const U64 = (1n << 64n) - 1n;
const U160 = (1n << 160n) - 1n;

export function saltWithBound(bound: bigint, random: bigint): bigint {
  if (bound <= 0n || bound > U64) throw new Error("A bound is a token id between 1 and 2^64 - 1.");
  return (BOUND_TAG << 224n) | (bound << 160n) | (random & U160);
}

/** The bound an order's salt carries, or undefined for an ordinary salt. */
export function boundOfSalt(salt: bigint): bigint | undefined {
  if (salt >> 224n !== BOUND_TAG) return undefined;
  const bound = (salt >> 160n) & U64;
  return bound === 0n ? undefined : bound;
}
