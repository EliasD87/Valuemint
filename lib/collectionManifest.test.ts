import { describe, expect, it } from "vitest";
import { parseManifest, supplyOfManifest, MAX_MANIFEST_SUPPLY } from "@/lib/collectionManifest";
import { assignDesigns } from "@/lib/buildMetadata";
import live from "@/lib/__fixtures__/genesis-live.json";

/**
 * Characterisation tests, written BEFORE the v3 change rather than after.
 *
 * `parseManifest` and `assignDesigns` had no tests at all, and between them
 * they decide what every token of every manifest-backed collection is. A
 * manifest is immutable once pinned and a collection's `baseURI` points at one
 * forever, so a behaviour change here does not cause a bug to be fixed later —
 * it silently changes what somebody owns.
 *
 * The fixture is the REAL ValueChain Genesis manifest together with the
 * assignment the live site was serving when these were written. That is the
 * strongest form this can take: not "the shuffle is deterministic" but "the
 * shuffle still produces exactly what 77 people already own".
 */

const VALID_V2 = {
  v: 2,
  name: "Test",
  description: "A test collection.",
  seed: "seed-1",
  designs: [
    { file: "a.jpg", name: "A", count: 2, cid: "QmA", tier: "Common" },
    { file: "b.jpg", name: "B", count: 1, cid: "QmB", tier: "Rare" },
  ],
};

describe("parseManifest — versions it must keep accepting", () => {
  it("accepts a v2 manifest", () => {
    expect(parseManifest(VALID_V2)?.v).toBe(2);
  });

  it("accepts a v1 manifest with a directory CID", () => {
    const v1 = { ...VALID_V2, v: 1, imagesCid: "QmDir", designs: [{ file: "a.jpg", name: "A", count: 1 }] };
    expect(parseManifest(v1)?.v).toBe(1);
  });

  it("refuses v1 without a directory CID — its art would be unreachable", () => {
    const { imagesCid, ...rest } = { ...VALID_V2, v: 1, imagesCid: "QmDir" };
    expect(parseManifest(rest)).toBeUndefined();
  });

  it("refuses a v2 design with no CID of its own", () => {
    const bad = { ...VALID_V2, designs: [{ file: "a.jpg", name: "A", count: 1 }] };
    expect(parseManifest(bad)).toBeUndefined();
  });

  it("refuses an unknown version rather than guessing", () => {
    expect(parseManifest({ ...VALID_V2, v: 99 })).toBeUndefined();
  });

  it("refuses anything that is not an object", () => {
    for (const junk of [null, undefined, 7, "x", []]) {
      expect(parseManifest(junk)).toBeUndefined();
    }
  });
});

describe("parseManifest — the guards that stop a hostile manifest", () => {
  it("refuses a supply past the ceiling", () => {
    const huge = { ...VALID_V2, designs: [{ file: "a.jpg", name: "A", count: MAX_MANIFEST_SUPPLY + 1, cid: "QmA" }] };
    expect(parseManifest(huge)).toBeUndefined();
  });

  it("accepts a supply exactly at the ceiling", () => {
    const edge = { ...VALID_V2, designs: [{ file: "a.jpg", name: "A", count: MAX_MANIFEST_SUPPLY, cid: "QmA" }] };
    expect(parseManifest(edge)).toBeDefined();
  });

  it("refuses a non-integer or zero edition count", () => {
    for (const count of [0, -1, 1.5, Number.NaN]) {
      expect(parseManifest({ ...VALID_V2, designs: [{ file: "a.jpg", name: "A", count, cid: "QmA" }] })).toBeUndefined();
    }
  });

  it("refuses an empty designs array", () => {
    expect(parseManifest({ ...VALID_V2, designs: [] })).toBeUndefined();
  });

  /** `externalUrl` is rendered as a link by explorers, so it is validated. */
  it("drops a non-https externalUrl instead of passing it through", () => {
    const m = parseManifest({ ...VALID_V2, externalUrl: "javascript:alert(1)" });
    expect(m?.externalUrl).toBeUndefined();
  });

  it("keeps an https externalUrl", () => {
    expect(parseManifest({ ...VALID_V2, externalUrl: "https://example.com" })?.externalUrl)
      .toBe("https://example.com");
  });

  it("drops a non-https gateway", () => {
    expect(parseManifest({ ...VALID_V2, gateway: "http://evil.test" })?.gateway).toBeUndefined();
  });
});

describe("supplyOfManifest", () => {
  it("sums the edition counts", () => {
    expect(supplyOfManifest(parseManifest(VALID_V2)!)).toBe(3);
  });
});

describe("assignDesigns — the shuffle nobody may change", () => {
  it("is deterministic for a seed", () => {
    const m = parseManifest(VALID_V2)!;
    expect(assignDesigns(m.designs, m.seed).map((a) => a.design.name))
      .toEqual(assignDesigns(m.designs, m.seed).map((a) => a.design.name));
  });

  it("produces exactly the declared totals, never approximately", () => {
    const m = parseManifest(VALID_V2)!;
    const got = assignDesigns(m.designs, m.seed);
    expect(got).toHaveLength(3);
    expect(got.filter((a) => a.design.name === "A")).toHaveLength(2);
    expect(got.filter((a) => a.design.name === "B")).toHaveLength(1);
  });

  it("numbers editions from one, per design", () => {
    const m = parseManifest(VALID_V2)!;
    const a = assignDesigns(m.designs, m.seed).filter((x) => x.design.name === "A");
    expect(a.map((x) => x.edition).sort()).toEqual([1, 2]);
  });

  it("a different seed gives a different deck", () => {
    const m = parseManifest(VALID_V2)!;
    const big = { ...m, designs: [{ ...m.designs[0]!, count: 30 }, { ...m.designs[1]!, count: 30 }] };
    const x = assignDesigns(big.designs, "seed-a").map((a) => a.design.name).join("");
    const y = assignDesigns(big.designs, "seed-b").map((a) => a.design.name).join("");
    expect(x).not.toBe(y);
  });

  it("refuses an empty design list", () => {
    expect(() => assignDesigns([], "s")).toThrow();
  });
});

/**
 * THE ONE THAT MATTERS.
 *
 * Seventy-seven people own a specific design because this function said so. If
 * a change here moves one of them, this fails.
 */
describe("ValueChain Genesis, against what the live site actually serves", () => {
  const manifest = parseManifest(live.manifest)!;

  it("parses the real manifest", () => {
    expect(manifest).toBeDefined();
    expect(manifest.v).toBe(2);
    expect(manifest.seed).toBe("valuechain-genesis-2026-08-28");
    expect(supplyOfManifest(manifest)).toBe(100);
  });

  it("reproduces all 100 live assignments, design and edition", () => {
    const got = assignDesigns(manifest.designs, manifest.seed);
    expect(got).toHaveLength(live.assignment.length);

    const mine = got.map((a) => [a.design.name, `${a.edition} of ${a.design.count}`]);
    expect(mine).toEqual(live.assignment);
  });

  it("still puts ORIGIN — 3 of 100 — where the holders expect it", () => {
    const got = assignDesigns(manifest.designs, manifest.seed);
    const origins = got
      .map((a, i) => ({ token: i + 1, name: a.design.name }))
      .filter((x) => x.name === "ORIGIN")
      .map((x) => x.token);
    expect(origins).toHaveLength(3);
    // Recorded from the live site, not from this function.
    const fromLive = live.assignment
      .map((a, i) => ({ token: i + 1, name: a[0] }))
      .filter((x) => x.name === "ORIGIN")
      .map((x) => x.token);
    expect(origins).toEqual(fromLive);
  });
});

/**
 * v3 — an explicit assignment that may stop short of the supply.
 *
 * The point of the format is that the unminted tail is ABSENT rather than
 * encrypted or flagged: there is nothing in the file to compute from. These
 * check the parser refuses every way of getting that wrong, because a manifest
 * is immutable once pinned and a bad one cannot be taken back.
 */
const VALID_V3 = {
  v: 3,
  name: "Test",
  description: "A test collection.",
  seed: "seed-1",
  designs: [
    { file: "a.jpg", name: "A", count: 2, cid: "QmA", tier: "Common" },
    { file: "b.jpg", name: "B", count: 1, cid: "QmB", tier: "Rare" },
  ],
  assignment: [0, 1, 0],
};

const HIDDEN = { name: "Unrevealed", file: "hidden.jpg", cid: "QmHidden" };

describe("parseManifest — v3", () => {
  it("accepts a full explicit assignment", () => {
    const m = parseManifest(VALID_V3)!;
    expect(m.v).toBe(3);
    expect(m.assignment).toEqual([0, 1, 0]);
  });

  it("accepts an assignment short of the supply when there is a hidden design", () => {
    const m = parseManifest({ ...VALID_V3, assignment: [0], hidden: HIDDEN })!;
    expect(m.assignment).toEqual([0]);
    expect(m.hidden).toEqual(HIDDEN);
  });

  /** Otherwise the tokens past the end have nothing to serve at all. */
  it("refuses a short assignment with no hidden design", () => {
    expect(parseManifest({ ...VALID_V3, assignment: [0] })).toBeUndefined();
  });

  it("refuses an assignment longer than the supply", () => {
    expect(parseManifest({ ...VALID_V3, assignment: [0, 1, 0, 1] })).toBeUndefined();
  });

  /** An out-of-range index would resolve to no design at all. */
  it("refuses an index past the end of designs", () => {
    expect(parseManifest({ ...VALID_V3, assignment: [0, 2, 0] })).toBeUndefined();
  });

  it("refuses a negative or fractional index", () => {
    expect(parseManifest({ ...VALID_V3, assignment: [0, -1, 0] })).toBeUndefined();
    expect(parseManifest({ ...VALID_V3, assignment: [0, 1.5, 0] })).toBeUndefined();
  });

  it("refuses a non-array assignment", () => {
    expect(parseManifest({ ...VALID_V3, assignment: "0,1,0" })).toBeUndefined();
  });

  it("refuses a hidden design missing its CID", () => {
    const bad = { ...VALID_V3, assignment: [0], hidden: { name: "x", file: "y.jpg" } };
    expect(parseManifest(bad)).toBeUndefined();
  });

  it("keeps the commitment when present", () => {
    const m = parseManifest({ ...VALID_V3, assignment: [0], hidden: HIDDEN, commit: "abc123" })!;
    expect(m.commit).toBe("abc123");
  });

  /** v3 still addresses art per design, exactly as v2 does. */
  it("refuses a v3 design with no CID", () => {
    const bad = { ...VALID_V3, designs: [{ file: "a.jpg", name: "A", count: 3 }] };
    expect(parseManifest(bad)).toBeUndefined();
  });

  /**
   * The guarantee the whole exercise rests on: a manifest that hides its tail
   * contains no trace of what the tail is.
   */
  it("a short assignment leaves nothing in the file to compute the tail from", () => {
    const m = parseManifest({ ...VALID_V3, assignment: [0], hidden: HIDDEN })!;
    expect(m.assignment).toHaveLength(1);
    expect(supplyOfManifest(m)).toBe(3);
    // The two unrevealed tokens appear nowhere.
    expect(JSON.stringify(m)).not.toContain('"1,0"');
    expect(m.assignment!.length).toBeLessThan(supplyOfManifest(m));
  });
});

describe("v1 and v2 are untouched by v3 existing", () => {
  it("still refuses an assignment on a v2 manifest", () => {
    const m = parseManifest({ ...VALID_V2, assignment: [0, 1, 0] })!;
    expect(m.assignment).toBeUndefined();
  });

  it("still refuses a hidden design on a v2 manifest", () => {
    const m = parseManifest({ ...VALID_V2, hidden: HIDDEN })!;
    expect(m.hidden).toBeUndefined();
  });

  it("still refuses a commit on a v2 manifest", () => {
    const m = parseManifest({ ...VALID_V2, commit: "abc" })!;
    expect(m.commit).toBeUndefined();
  });
});
