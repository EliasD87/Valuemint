import { describe, expect, it } from "vitest";
import { bytesToHex } from "viem";
import { boundOfSalt, criteriaTree, leafOf, saltWithBound, verifyProof } from "./criteria";

/**
 * The tree must match what Seaport verifies, byte for byte; the settlement test
 * against Seaport's real bytecode lives in contracts/test. These pin the
 * properties that test depends on.
 */

describe("criteriaTree", () => {
  it("proves every member and nothing else", () => {
    const ids = [3n, 17n, 42n, 99n, 1000n, 7n, 250n];
    const tree = criteriaTree(ids);
    for (const id of ids) {
      expect(tree.has(id)).toBe(true);
      expect(verifyProof(id, tree.root, tree.proof(id)!)).toBe(true);
    }
    expect(tree.has(5n)).toBe(false);
    expect(tree.proof(5n)).toBeUndefined();
    /** A member's proof does not prove a stranger. */
    expect(verifyProof(5n, tree.root, tree.proof(3n)!)).toBe(false);
  });

  it("gives the same root whatever the order or duplicates", () => {
    expect(criteriaTree([1n, 2n, 3n, 2n]).root).toBe(criteriaTree([3n, 1n, 2n]).root);
  });

  it("gives a different root for a different set", () => {
    expect(criteriaTree([1n, 2n, 3n]).root).not.toBe(criteriaTree([1n, 2n, 4n]).root);
  });

  it("handles one token (the root is its leaf, the proof empty) and odd sizes", () => {
    const one = criteriaTree([9n]);
    expect(one.root).toBe(bytesToHex(leafOf(9n)));
    expect(one.proof(9n)).toEqual([]);
    for (const n of [2, 3, 5, 8, 9, 31, 64, 65]) {
      const ids = Array.from({ length: n }, (_, i) => BigInt(i * 7 + 1));
      const t = criteriaTree(ids);
      expect(ids.every((id) => verifyProof(id, t.root, t.proof(id)!))).toBe(true);
    }
  });

  it("refuses an empty set", () => {
    expect(() => criteriaTree([])).toThrow();
  });

  /** Trenches-sized: 5,000 ids, proof length log2. */
  it("scales to a Trenches depth", () => {
    const ids = Array.from({ length: 5_000 }, (_, i) => 1_000_000n + BigInt(i + 1));
    const t = criteriaTree(ids);
    const p = t.proof(1_004_321n)!;
    expect(p.length).toBeLessThanOrEqual(13);
    expect(verifyProof(1_004_321n, t.root, p)).toBe(true);
  });
});

describe("bounds in the salt", () => {
  it("round-trips a bound and keeps the random part", () => {
    const salt = saltWithBound(59_190n, 0xdeadbeefn);
    expect(boundOfSalt(salt)).toBe(59_190n);
    expect(salt & 0xffffffffn).toBe(0xdeadbeefn);
  });

  it("reads no bound from an ordinary random salt", () => {
    expect(boundOfSalt(0x1234_5678_9abc_def0n)).toBeUndefined();
    expect(boundOfSalt(0n)).toBeUndefined();
  });

  it("refuses a bound that does not fit", () => {
    expect(() => saltWithBound(0n, 1n)).toThrow();
    expect(() => saltWithBound(1n << 64n, 1n)).toThrow();
  });
});
