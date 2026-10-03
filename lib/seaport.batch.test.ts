import { describe, expect, it } from "vitest";
import {
  FEE_RECIPIENT,
  ItemType,
  LISTINGS_PER_TX,
  MAX_BATCH_OFFER,
  OrderType,
  buildListing,
  buildOffer,
  fulfillerOutlay,
  planBulkCancel,
  readOrder,
  remainingPieces,
  splitFee,
  unsafeReason,
  type OrderParameters,
} from "./seaport";

/**
 * Batch offers and batch cancel (2026-10-03).
 *
 * The protocol half — that Seaport settles one piece, several pieces in one
 * transaction, never more than asked, and refuses an amount that does not
 * divide — is in contracts/test/SeaportBatchOrders.test.ts against the real
 * bytecode. This file is the app's half: the shape `buildOffer` makes, the
 * whitelist admitting exactly that and nothing looser, and every price read
 * back PER PIECE.
 */

const BIDDER = "0x2222222222222222222222222222222222222222" as const;
const SELLER = "0x1111111111111111111111111111111111111111" as const;
const STRANGER = "0x3333333333333333333333333333333333333333" as const;
const COLLECTION = "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750" as const;
const ROOT = "0x23e0741767f89217a6fb31315932bdef84eae7ee12f49c41476b0007ea608e45" as const;
const FOUR = 4n * 10n ** 18n;

const batch = (quantity: bigint, over: Partial<Parameters<typeof buildOffer>[0]> = {}) =>
  buildOffer({ bidder: BIDDER, collection: COLLECTION, priceWei: FOUR, quantity, ...over });

/** A built order with one field changed, the way an attacker would hand-roll it. */
const tamper = (p: OrderParameters, change: (p: OrderParameters) => OrderParameters) => change(p);

describe("buildOffer with a quantity", () => {
  it("multiplies the money, the fee and the pieces through, and is partially fillable", () => {
    const p = batch(10n);
    const fee = splitFee(FOUR).fee;

    expect(p.offer[0]!.startAmount).toBe(FOUR * 10n);
    expect(p.consideration[0]!.itemType).toBe(ItemType.ERC721_WITH_CRITERIA);
    expect(p.consideration[0]!.startAmount).toBe(10n);
    expect(p.consideration[0]!.recipient).toBe(BIDDER);
    expect(p.consideration[1]!.recipient).toBe(FEE_RECIPIENT);
    expect(p.consideration[1]!.startAmount).toBe(fee * 10n);
    expect(p.orderType).toBe(OrderType.PARTIAL_OPEN);
  });

  it("leaves a single offer exactly as it was", () => {
    const p = batch(1n);
    expect(p.offer[0]!.startAmount).toBe(FOUR);
    expect(p.consideration[0]!.startAmount).toBe(1n);
    expect(p.orderType).toBe(OrderType.FULL_OPEN);
  });

  it("works for a trait set too", () => {
    const p = batch(5n, { criteria: ROOT });
    expect(p.consideration[0]!.identifierOrCriteria).toBe(BigInt(ROOT));
    expect(unsafeReason(p)).toBeUndefined();
  });

  it("refuses a quantity on an offer for one named token, and out-of-range quantities", () => {
    expect(() => batch(2n, { tokenId: 7n })).toThrow();
    expect(() => batch(0n)).toThrow();
    expect(() => batch(MAX_BATCH_OFFER + 1n)).toThrow();
  });
});

describe("the whitelist and batch offers", () => {
  it("admits the shape the app builds, at every size up to the ceiling", () => {
    for (const q of [2n, 3n, 7n, 50n, MAX_BATCH_OFFER]) expect(unsafeReason(batch(q))).toBeUndefined();
  });

  it("refuses a batch that is fully fillable — the whole quantity would move at once", () => {
    const p = tamper(batch(3n), (p) => ({ ...p, orderType: OrderType.FULL_OPEN }));
    expect(unsafeReason(p)).toBe("bid-quantity-unsupported");
  });

  it("refuses a quantity on a bid for one named token", () => {
    const p = tamper(batch(3n), (p) => ({
      ...p,
      consideration: [{ ...p.consideration[0]!, itemType: ItemType.ERC721, identifierOrCriteria: 5n }, ...p.consideration.slice(1)],
    }));
    expect(unsafeReason(p)).toBe("bid-quantity-unsupported");
  });

  it("refuses money that does not divide by the quantity", () => {
    const p = tamper(batch(3n), (p) => ({
      ...p,
      offer: [{ ...p.offer[0]!, startAmount: p.offer[0]!.startAmount + 1n, endAmount: p.offer[0]!.endAmount + 1n }],
    }));
    expect(unsafeReason(p)).toBe("bid-quantity-unsupported");
  });

  it("refuses a fee that does not divide by the quantity", () => {
    const p = tamper(batch(3n), (p) => ({
      ...p,
      consideration: [
        p.consideration[0]!,
        { ...p.consideration[1]!, startAmount: p.consideration[1]!.startAmount + 1n, endAmount: p.consideration[1]!.endAmount + 1n },
      ],
    }));
    expect(unsafeReason(p)).toBe("bid-quantity-unsupported");
  });

  it("refuses more than the ceiling even when everything divides", () => {
    const q = MAX_BATCH_OFFER + 1n;
    const p = tamper(batch(1n), (p) => ({
      ...p,
      orderType: OrderType.PARTIAL_OPEN,
      offer: [{ ...p.offer[0]!, startAmount: FOUR * q, endAmount: FOUR * q }],
      consideration: [
        { ...p.consideration[0]!, startAmount: q, endAmount: q },
        { ...p.consideration[1]!, startAmount: splitFee(FOUR).fee * q, endAmount: splitFee(FOUR).fee * q },
      ],
    }));
    expect(unsafeReason(p)).toBe("bid-quantity-unsupported");
  });

  it("still holds the fee ceiling, per piece as for the whole", () => {
    const p = tamper(batch(4n), (p) => ({
      ...p,
      consideration: [p.consideration[0]!, { ...p.consideration[1]!, startAmount: FOUR * 4n, endAmount: FOUR * 4n }],
    }));
    expect(unsafeReason(p)).toBe("fulfiller-outlay-too-high");
  });
});

describe("reading a batch offer back", () => {
  it("prices it per piece and says how many pieces", () => {
    const read = readOrder(batch(10n))!;
    expect(read.kind).toBe("offer");
    expect(read.priceWei).toBe(FOUR);
    expect(read.amount).toBe(10n);
    expect(read.tokenId).toBeUndefined();
    expect(read.criteria).toBe(0n);
  });

  it("reads a single offer exactly as before", () => {
    const read = readOrder(batch(1n))!;
    expect(read.priceWei).toBe(FOUR);
    expect(read.amount).toBe(1n);
  });

  it("charges the accepting holder the fee for what they sell, not for the whole batch", () => {
    const fee = splitFee(FOUR).fee;
    expect(fulfillerOutlay(batch(10n))).toBe(fee);
    expect(fulfillerOutlay(batch(10n), 3n)).toBe(fee * 3n);
    expect(fulfillerOutlay(batch(1n))).toBe(fee);
  });

  it("counts the pieces still wanted from Seaport's fraction", () => {
    expect(remainingPieces({ amount: 10n, filled: 0n, size: 0n })).toBe(10n);
    expect(remainingPieces({ amount: 10n, filled: 3n, size: 10n })).toBe(7n);
    // Seaport reduces the fraction: 4 of 10 can be stored as 2 of 5.
    expect(remainingPieces({ amount: 10n, filled: 2n, size: 5n })).toBe(6n);
    expect(remainingPieces({ amount: 10n, filled: 5n, size: 5n })).toBe(0n);
    expect(remainingPieces({ amount: 1n, filled: 1n, size: 1n })).toBe(0n);
  });
});

describe("planBulkCancel", () => {
  const listingOf = (tokenId: bigint, seller: `0x${string}` = SELLER) => ({
    hash: `0x${tokenId.toString(16).padStart(64, "0")}${seller.slice(2, 4)}`,
    params: buildListing({ seller, collection: COLLECTION, tokenId, priceWei: FOUR }),
  });

  it("puts every one of the seller's orders in, with the live counter", () => {
    const batches = planBulkCancel({ seller: SELLER, orders: [listingOf(1n), listingOf(2n)], counter: 7n });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]!.every((c) => c.counter === 7n && c.offerer === SELLER)).toBe(true);
  });

  it("leaves out anybody else's order, so one cannot revert the batch", () => {
    const batches = planBulkCancel({
      seller: SELLER,
      orders: [listingOf(1n), listingOf(2n, STRANGER), listingOf(3n)],
      counter: 0n,
    });
    expect(batches.flat()).toHaveLength(2);
    expect(batches.flat().every((c) => c.offerer === SELLER)).toBe(true);
  });

  it("cancels each order once", () => {
    const one = listingOf(1n);
    expect(planBulkCancel({ seller: SELLER, orders: [one, one, one], counter: 0n }).flat()).toHaveLength(1);
  });

  it("splits at the per-transaction ceiling", () => {
    const orders = Array.from({ length: LISTINGS_PER_TX * 2 + 3 }, (_, i) => listingOf(BigInt(i + 1)));
    const batches = planBulkCancel({ seller: SELLER, orders, counter: 0n });
    expect(batches.map((b) => b.length)).toEqual([LISTINGS_PER_TX, LISTINGS_PER_TX, 3]);
  });
});
