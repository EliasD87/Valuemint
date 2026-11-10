import { describe, expect, it, vi } from "vitest";
import { parseEther, zeroAddress } from "viem";

/*
  The zone is undefined in the shipped config until it is deployed; these tests
  give it an address so the rules around it can be exercised.
*/
const ZONE = "0x00000000000000000000000000000000005ea1ed";
vi.mock("@/lib/cybereator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cybereator")>()),
  CYBEREATOR_SEALED_ZONE: "0x00000000000000000000000000000000005ea1ed",
}));

const { OrderType, buildOffer, isSealedOnlyBid, readOrder, unsafeReason } = await import("./seaport");
const { CYBEREATOR } = await import("@/lib/cybereator");

const BIDDER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const TEN = parseEther("10");
const cyber = CYBEREATOR as `0x${string}`;

const sealed = (quantity = 1n) =>
  buildOffer({ bidder: BIDDER, collection: cyber, priceWei: TEN, sealedOnly: true, ...(quantity > 1n ? { quantity } : {}) });

describe("Unopened (sealed-only) Cybereator offers", () => {
  it("are built restricted to the zone, on any piece", () => {
    const one = sealed();
    expect(one.zone).toBe(ZONE);
    expect(one.orderType).toBe(OrderType.FULL_RESTRICTED);
    expect(one.consideration[0]!.identifierOrCriteria).toBe(0n);
    expect(sealed(3n).orderType).toBe(OrderType.PARTIAL_RESTRICTED);
  });

  it("pass the safety check and read back as Unopened, priced per piece", () => {
    for (const q of [1n, 4n]) {
      const p = sealed(q);
      expect(unsafeReason(p)).toBeUndefined();
      expect(isSealedOnlyBid(p)).toBe(true);
      const read = readOrder(p)!;
      expect(read.sealedOnly).toBe(true);
      expect(read.criteria).toBe(0n);
      expect(read.priceWei).toBe(TEN);
      expect(read.amount).toBe(q);
    }
  });

  it("are refused for any other collection, a token, or a trait", () => {
    expect(() => buildOffer({ bidder: BIDDER, collection: OTHER, priceWei: TEN, sealedOnly: true })).toThrow();
    expect(() => buildOffer({ bidder: BIDDER, collection: cyber, tokenId: 5n, priceWei: TEN, sealedOnly: true })).toThrow();
    expect(() =>
      buildOffer({ bidder: BIDDER, collection: cyber, criteria: `0x${"ab".repeat(32)}`, priceWei: TEN, sealedOnly: true }),
    ).toThrow();
  });

  it("refuse every near-miss that names the zone", () => {
    const base = sealed();
    const variants = [
      // another collection
      { ...base, consideration: base.consideration.map((c, i) => (i === 0 ? { ...c, token: OTHER } : c)) },
      // a trait root instead of any piece
      { ...base, consideration: base.consideration.map((c, i) => (i === 0 ? { ...c, identifierOrCriteria: 7n } : c)) },
      // the piece going to someone else
      { ...base, consideration: base.consideration.map((c, i) => (i === 0 ? { ...c, recipient: OTHER } : c)) },
      // unrestricted, so the zone would never be asked
      { ...base, orderType: OrderType.FULL_OPEN },
      // a single piece made partial
      { ...base, orderType: OrderType.PARTIAL_RESTRICTED },
      // a zone hash
      { ...base, zoneHash: `0x${"01".repeat(32)}` as `0x${string}` },
    ];
    for (const v of variants) expect(unsafeReason(v)).toBeDefined();
  });

  it("still refuse any other zone, and a restricted order without one", () => {
    const plain = buildOffer({ bidder: BIDDER, collection: cyber, priceWei: TEN });
    expect(unsafeReason({ ...plain, zone: OTHER })).toBe("order-names-a-zone");
    expect(unsafeReason({ ...plain, orderType: OrderType.FULL_RESTRICTED })).toBe("order-type-unsupported");
    expect(readOrder(plain)!.sealedOnly).toBeUndefined();
    expect(plain.zone).toBe(zeroAddress);
  });

  it("refuse a listing that names the zone", () => {
    const listing = {
      ...sealed(),
      offer: [{ itemType: 2, token: cyber, identifierOrCriteria: 1n, startAmount: 1n, endAmount: 1n }],
      consideration: [{ itemType: 0, token: zeroAddress, identifierOrCriteria: 0n, startAmount: TEN, endAmount: TEN, recipient: BIDDER }],
      totalOriginalConsiderationItems: 1n,
    };
    expect(unsafeReason(listing)).toBe("order-names-a-zone");
  });
});
