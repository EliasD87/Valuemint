import { describe, expect, it } from "vitest";
import { offerKey, summariseOffers, type OfferBid, type OfferState } from "./offers";

const COLL = "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6" as const;
const OTHER = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B" as const;
const WSOSO = "0x5050505050505050505050505050505050505050" as const;

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;

const NOW = 1_800_000_000n;

const bid = (id: bigint, bidder: `0x${string}`, collection: `0x${string}` = COLL): OfferBid => ({
  collection,
  id,
  bidder,
});

const live = (price: bigint, expiry = 0n): OfferState => ({
  paymentToken: WSOSO,
  price,
  expiry,
});

describe("summariseOffers", () => {
  it("reports a single live offer with its bidder", () => {
    const out = summariseOffers([bid(1n, A)], [live(2n * 10n ** 18n)], NOW);

    expect(out.size).toBe(1);
    expect(out.get(offerKey(COLL, 1n))).toEqual({
      best: 2n * 10n ** 18n,
      count: 1,
      bidder: A,
      paymentToken: WSOSO,
      expiry: 0n,
    });
  });

  /**
   * The reason this file exists. `acceptOffer(collection, id, bidder, minPrice)`
   * takes both, so the top price and the address that made it have to stay
   * together — pairing 5 with the wallet that bid 3 reverts on `NoOffer` with
   * nothing on screen having looked wrong.
   */
  it("keeps the highest price and that bidder's address together", () => {
    const out = summariseOffers([bid(1n, A), bid(1n, B)], [live(3n), live(5n)], NOW);

    expect(out.get(offerKey(COLL, 1n))).toMatchObject({ best: 5n, bidder: B, count: 2 });
  });

  it("does not let a later, lower offer steal the summary", () => {
    const out = summariseOffers([bid(1n, A), bid(1n, B)], [live(5n), live(3n)], NOW);

    expect(out.get(offerKey(COLL, 1n))).toMatchObject({ best: 5n, bidder: A, count: 2 });
  });

  it("drops offers that read back zeroed — withdrawn, accepted or overwritten", () => {
    const out = summariseOffers([bid(1n, A), bid(1n, B)], [live(0n), live(4n)], NOW);

    expect(out.get(offerKey(COLL, 1n))).toMatchObject({ best: 4n, bidder: B, count: 1 });
  });

  it("drops expired offers but keeps ones with no expiry", () => {
    const out = summariseOffers(
      [bid(1n, A), bid(1n, B)],
      [live(9n, NOW - 1n), live(4n, 0n)],
      NOW,
    );

    expect(out.get(offerKey(COLL, 1n))).toMatchObject({ best: 4n, bidder: B, count: 1 });
  });

  it("treats an expiry exactly at now as expired, as the contract does", () => {
    const out = summariseOffers([bid(1n, A)], [live(9n, NOW)], NOW);

    expect(out.size).toBe(0);
  });

  it("skips reads that failed rather than counting them", () => {
    const out = summariseOffers([bid(1n, A), bid(1n, B)], [undefined, live(4n)], NOW);

    expect(out.get(offerKey(COLL, 1n))).toMatchObject({ best: 4n, bidder: B, count: 1 });
  });

  it("keeps tokens apart, including the same id in different collections", () => {
    const out = summariseOffers(
      [bid(1n, A), bid(2n, B), bid(1n, B, OTHER)],
      [live(7n), live(1n), live(6n)],
      NOW,
    );

    expect(out.size).toBe(3);
    expect(out.get(offerKey(COLL, 1n))).toMatchObject({ best: 7n, bidder: A });
    expect(out.get(offerKey(COLL, 2n))).toMatchObject({ best: 1n, bidder: B });
    expect(out.get(offerKey(OTHER, 1n))).toMatchObject({ best: 6n, bidder: B });
  });

  it("returns nothing when every offer is gone", () => {
    expect(summariseOffers([bid(1n, A)], [live(0n)], NOW).size).toBe(0);
    expect(summariseOffers([], [], NOW).size).toBe(0);
  });
});

describe("offerKey", () => {
  it("is case-insensitive on the address, since logs and config disagree", () => {
    expect(offerKey(COLL.toUpperCase(), 1n)).toBe(offerKey(COLL.toLowerCase(), 1n));
  });

  it("does not collide across ids that share a prefix", () => {
    expect(offerKey(COLL, 1n)).not.toBe(offerKey(COLL, 11n));
  });
});
