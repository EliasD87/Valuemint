import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { buildListing, buildOffer, readOrder, resolveFillable } from "./seaport";
import { decodeChecks, fillabilityQuestions, type CheckTarget, type WireChecks } from "./orderChecks";

/**
 * The server now answers the order book's fillability questions ahead of the
 * browser, and the browser matches those answers to its own questions by key.
 * Two things must hold or a listing shows as buyable when it is not: the keys
 * the two sides build are the same, and an answer that arrives in the wrong
 * shape is read as refused, never as a yes.
 */

const SELLER = "0x1111111111111111111111111111111111111111" as Address;
const BIDDER = "0x2222222222222222222222222222222222222222" as Address;
const COLLECTION = "0x3333333333333333333333333333333333333333" as Address;

function target(hash: string, params: ReturnType<typeof buildListing>): CheckTarget {
  const read = readOrder(params);
  if (read === undefined) throw new Error("fixture did not read");
  return { hash: hash as Hex, params, read };
}

const listingA = target("0xaa", buildListing({ seller: SELLER, collection: COLLECTION, tokenId: 7n, priceWei: 10n ** 18n }));
const listingB = target("0xbb", buildListing({ seller: SELLER, collection: COLLECTION, tokenId: 8n, priceWei: 2n * 10n ** 18n }));
const offer = target("0xcc", buildOffer({ bidder: BIDDER, collection: COLLECTION, tokenId: 7n, priceWei: 10n ** 18n }));

describe("fillabilityQuestions", () => {
  it("asks a seller's approval once for all their listings in a collection", () => {
    const q = fillabilityQuestions([listingA, listingB]);
    expect(q.keys.filter((k) => k.startsWith("approval:"))).toHaveLength(1);
    expect(q.keys.filter((k) => k.startsWith("owner:"))).toHaveLength(2);
    expect(q.slots.get("0xaa")?.[1]).toBe(q.slots.get("0xbb")?.[1]);
  });

  it("builds the same keys every time, which is what the browser and server match on", () => {
    expect(fillabilityQuestions([listingA, offer]).keys).toEqual(fillabilityQuestions([listingA, offer]).keys);
  });

  it("asks a bid about the bidder's money, not about a token", () => {
    const q = fillabilityQuestions([offer]);
    expect(q.keys[0]).toMatch(/^balance20:/);
    expect(q.keys[1]).toMatch(/^allowance:/);
  });
});

describe("decodeChecks", () => {
  const q = fillabilityQuestions([listingA]);
  const [ownerKey, approvalKey] = q.keys as [string, string];
  const wire = (reads: WireChecks["reads"]): WireChecks => ({
    at: "2026-10-25T12:00:00Z",
    status: { "0xaa": [true, false, "0", "0"] },
    reads,
  });

  it("round-trips a fillable listing", () => {
    const checks = decodeChecks(wire({ [ownerKey]: SELLER, [approvalKey]: true }))!;
    expect(checks.status.get("0xaa")).toEqual([true, false, 0n, 0n]);
    const verdict = resolveFillable({ ...listingA.read, params: listingA.params }, {
      first: checks.reads.get(ownerKey),
      second: checks.reads.get(approvalKey),
    });
    expect(verdict).toBe(true);
  });

  it("reads a refused question as refused, so the listing is not buyable", () => {
    const checks = decodeChecks(wire({ [ownerKey]: null, [approvalKey]: true }))!;
    expect(checks.reads.get(ownerKey)).toEqual({ status: "failure" });
    expect(
      resolveFillable({ ...listingA.read, params: listingA.params }, {
        first: checks.reads.get(ownerKey),
        second: checks.reads.get(approvalKey),
      }),
    ).toBe(false);
  });

  it("refuses an answer in the wrong shape rather than guessing", () => {
    /* An approval that arrives as the string "true" is not a yes. */
    const checks = decodeChecks(wire({ [ownerKey]: SELLER, [approvalKey]: "true" }))!;
    expect(checks.reads.get(approvalKey)).toEqual({ status: "failure" });
    /* An owner that is not an address is not an owner. */
    const bad = decodeChecks(wire({ [ownerKey]: "nobody", [approvalKey]: true }))!;
    expect(bad.reads.get(ownerKey)).toEqual({ status: "failure" });
  });

  it("decodes balances as bigints and rejects anything that is not a whole number", () => {
    const o = fillabilityQuestions([offer]);
    const [bal, allow] = o.keys as [string, string];
    const ok = decodeChecks({ at: "2026-10-25T12:00:00Z", status: {}, reads: { [bal]: "5000", [allow]: "1.5" } })!;
    expect(ok.reads.get(bal)).toEqual({ status: "success", result: 5000n });
    expect(ok.reads.get(allow)).toEqual({ status: "failure" });
  });

  it("drops a malformed status rather than reading it as open", () => {
    const checks = decodeChecks({
      at: "2026-10-25T12:00:00Z",
      status: { "0xaa": ["yes", false, "0", "0"] as unknown as [boolean, boolean, string, string] },
      reads: {},
    })!;
    expect(checks.status.has("0xaa")).toBe(false);
  });

  it("ignores a payload with no usable timestamp", () => {
    expect(decodeChecks({ at: "not a date", status: {}, reads: {} })).toBeUndefined();
    expect(decodeChecks(undefined)).toBeUndefined();
  });
});
