import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { ACCEPTED_BID_CURRENCY, FEE_BPS, FEE_RECIPIENT, ItemType, ORDER_BOOK_WINDOW_BLOCKS, OrderType, buildListing, buildOffer, fulfillerOutlay, isExpired, listingIsFillable, lotPrice, resolveFillable, offerIsFillable, orderBookFloor, readFulfilment, readOrder, splitFee, toComponents, type OrderParameters, unitPrice, unsafeReason } from "./seaport";
import { deployment } from "@/config/contracts";

/**
 * These tests exist because a wrong Seaport order does not throw.
 *
 * Every failure mode worth guarding here is silent: a consideration item
 * pointing at the wrong address pays a stranger and settles; a price summed over
 * the wrong items quotes a figure the wallet then disagrees with; a bid built
 * with a plain ERC721 item instead of a criteria one is a collection offer
 * nobody can accept. None of that surfaces as an error, so it has to surface as
 * a test.
 *
 * The complement to this file is contracts/test/SeaportOrders.test.ts, which
 * builds the same shapes against the real Seaport bytecode and proves they
 * actually settle. This file is about arithmetic and structure; that one is
 * about the protocol accepting them.
 */

const SELLER = "0x1111111111111111111111111111111111111111" as const;
const BUYER = "0x2222222222222222222222222222222222222222" as const;
const COLLECTION = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B" as const;
const WSOSO = deployment.wsoso;

const ONE = 10n ** 18n;
const TEN = 10n * ONE;

const listing = (over: Partial<Parameters<typeof buildListing>[0]> = {}) =>
  buildListing({ seller: SELLER, collection: COLLECTION, tokenId: 1n, priceWei: TEN, ...over });

const offer = (over: Partial<Parameters<typeof buildOffer>[0]> = {}) =>
  buildOffer({ bidder: BUYER, collection: COLLECTION, tokenId: 1n, priceWei: TEN, ...over });

/** What the buyer actually hands over: every native item in the consideration. */
const buyerPays = (p: OrderParameters) =>
  p.consideration
    .filter((c) => c.itemType === ItemType.NATIVE)
    .reduce((n, c) => n + c.startAmount, 0n);

describe("splitFee", () => {
  it("takes the fee out of the total rather than adding it on top", () => {
    const { fee, net } = splitFee(TEN);
    expect(fee).toBe((TEN * FEE_BPS) / 10_000n);
    expect(fee + net).toBe(TEN);
  });

  /**
   * Integer division truncates, so the fee on a dust price rounds to zero. That
   * is the right direction: it can never round *up* and take more than the
   * quoted price, and `buildListing` drops a zero item rather than emitting one.
   */
  it("never takes more than the total, even at one wei", () => {
    const { fee, net } = splitFee(1n);
    expect(fee).toBe(0n);
    expect(net).toBe(1n);
  });
});

describe("buildListing", () => {
  it("offers the token and asks for the whole price back in native SOSO", () => {
    const p = listing();

    expect(p.offer).toHaveLength(1);
    expect(p.offer[0]).toMatchObject({
      itemType: ItemType.ERC721,
      token: COLLECTION,
      identifierOrCriteria: 1n,
      startAmount: 1n,
      endAmount: 1n,
    });

    /**
     * The headline guarantee: the figure quoted is the figure paid. If the fee
     * were added on top instead, the card would say 10 and the wallet 10.25.
     */
    expect(buyerPays(p)).toBe(TEN);
  });

  it("pays the seller the net and the marketplace the fee", () => {
    const p = listing();
    const { fee, net } = splitFee(TEN);

    const toSeller = p.consideration.find((c) => c.recipient === SELLER);
    const toFee = p.consideration.find((c) => c.recipient === FEE_RECIPIENT);

    expect(toSeller?.startAmount).toBe(net);
    expect(toFee?.startAmount).toBe(fee);
  });

  /**
   * Seaport rejects an order whose `totalOriginalConsiderationItems` disagrees
   * with the array. It is trivially derivable and trivially forgotten, and it is
   * the one mistake here that fails loudly - so it is worth pinning precisely
   * because a future edit that adds an item will otherwise break every order.
   */
  it("keeps totalOriginalConsiderationItems in step with the array", () => {
    for (const p of [listing(), listing({ priceWei: 1n }), listing({ amount: 5n })]) {
      expect(p.totalOriginalConsiderationItems).toBe(BigInt(p.consideration.length));
    }
  });

  it("emits no zero-value fee item when the fee rounds away", () => {
    const p = listing({ priceWei: 1n });
    expect(p.consideration).toHaveLength(1);
    expect(p.consideration[0]?.recipient).toBe(SELLER);
  });

  it("is unrestricted and names no zone, so Seaport calls nothing extra", () => {
    const p = listing();
    expect(p.orderType).toBe(OrderType.FULL_OPEN);
    expect(p.zone).toBe(zeroAddress);
  });

  it("lists ERC-1155 quantities as partially fillable", () => {
    const p = listing({ amount: 5n });
    expect(p.offer[0]?.itemType).toBe(ItemType.ERC1155);
    expect(p.offer[0]?.startAmount).toBe(5n);
    expect(p.orderType).toBe(OrderType.PARTIAL_OPEN);
  });

  it("gives two listings of the same token different salts", () => {
    expect(listing().salt).not.toBe(listing().salt);
  });

  it("expires, and inside the window asked for", () => {
    const now = Math.floor(Date.now() / 1000);
    const p = listing({ days: 7 });
    expect(Number(p.endTime)).toBeGreaterThan(now + 6 * 86_400);
    expect(Number(p.endTime)).toBeLessThanOrEqual(now + 7 * 86_400);
  });
});

describe("buildOffer", () => {
  it("offers WSOSO and asks for the token to come back to the bidder", () => {
    const p = offer();

    expect(p.offer[0]).toMatchObject({
      itemType: ItemType.ERC20,
      token: WSOSO,
      startAmount: TEN,
    });

    const nft = p.consideration.find((c) => c.token === COLLECTION);
    expect(nft).toMatchObject({ itemType: ItemType.ERC721, identifierOrCriteria: 1n, recipient: BUYER });
  });

  /**
   * The bug that started all of this. An offer on SoDex Larpers #1 could not be
   * taken by the holder of #2, because it named one token. A criteria item with
   * `identifierOrCriteria` zero means any token in the contract.
   */
  it("makes a collection offer that any token in the contract satisfies", () => {
    const p = offer({ tokenId: undefined });
    const nft = p.consideration.find((c) => c.token === COLLECTION);

    expect(nft?.itemType).toBe(ItemType.ERC721_WITH_CRITERIA);
    expect(nft?.identifierOrCriteria).toBe(0n);
  });

  it("routes the fee out of the proceeds, in the same currency as the bid", () => {
    const p = offer();
    const fee = p.consideration.find((c) => c.recipient === FEE_RECIPIENT);

    expect(fee?.itemType).toBe(ItemType.ERC20);
    expect(fee?.token).toBe(WSOSO);
    expect(fee?.startAmount).toBe(splitFee(TEN).fee);
  });

  /**
   * A bid must never offer native currency. Seaport can only pull an ERC-20 from
   * a standing allowance; native value has to arrive with the transaction, which
   * the bidder is not the one sending.
   */
  it("never prices a bid in native SOSO", () => {
    for (const p of [offer(), offer({ tokenId: undefined })]) {
      expect(p.offer.some((i) => i.itemType === ItemType.NATIVE)).toBe(false);
    }
  });
});

/**
 * The orders that rob whoever fills them.
 *
 * All three settled against real Seaport 1.6 bytecode in
 * contracts/test/SeaportHostileOrders.test.ts — this is not a hypothetical
 * threat model, it is three measured thefts. The rule under test is the one
 * thing standing between them and a user's wallet, because Seaport charges the
 * fulfiller every consideration item whether or not a frontend shows it.
 */
describe("unsafeReason — hostile order shapes", () => {
  const ATTACKER = "0x3333333333333333333333333333333333333333" as const;
  const erc20 = (amount: bigint, to: `0x${string}`, token: `0x${string}` = WSOSO) => ({
    itemType: ItemType.ERC20,
    token,
    identifierOrCriteria: 0n,
    startAmount: amount,
    endAmount: amount,
    recipient: to,
  });
  const nft = (id: bigint, to: `0x${string}`) => ({
    itemType: ItemType.ERC721,
    token: COLLECTION,
    identifierOrCriteria: id,
    startAmount: 1n,
    endAmount: 1n,
    recipient: to,
  });

  /** Attack 1: a 0.5 bid that takes 500 from the holder who accepts it. */
  it("refuses a bid whose consideration takes more than it offers", () => {
    const bait = ONE / 2n;
    const hostile: OrderParameters = {
      ...offer(),
      offerer: ATTACKER,
      offer: [
        { itemType: ItemType.ERC20, token: WSOSO, identifierOrCriteria: 0n, startAmount: bait, endAmount: bait },
      ],
      consideration: [nft(1n, ATTACKER), erc20(500n * ONE, ATTACKER)],
      totalOriginalConsiderationItems: 2n,
    };

    expect(unsafeReason(hostile)).toBe("fulfiller-outlay-too-high");
    expect(readOrder(hostile)).toBeUndefined();
  });

  /** Attack 2: names two tokens, the page showed one. Needs no allowance at all. */
  it("refuses a bid naming a second NFT", () => {
    const hostile: OrderParameters = {
      ...offer(),
      offerer: ATTACKER,
      consideration: [nft(1n, ATTACKER), nft(2n, ATTACKER)],
      totalOriginalConsiderationItems: 2n,
    };

    expect(unsafeReason(hostile)).toBe("bid-must-name-exactly-one-nft");
    expect(readOrder(hostile)).toBeUndefined();
  });

  /** Attack 3: a SOSO price on screen, a WSOSO charge from a standing allowance. */
  it("refuses a listing with a currency line that is not native", () => {
    const base = listing();
    const hostile: OrderParameters = {
      ...base,
      consideration: [...base.consideration, erc20(250n * ONE, ATTACKER)],
      totalOriginalConsiderationItems: BigInt(base.consideration.length + 1),
    };

    expect(unsafeReason(hostile)).toBe("listing-consideration-must-be-native");
    expect(readOrder(hostile)).toBeUndefined();
  });

  it("refuses an order whose amounts move over its lifetime", () => {
    const base = listing();
    const dutch: OrderParameters = {
      ...base,
      consideration: base.consideration.map((c, i) =>
        i === 0 ? { ...c, endAmount: c.startAmount * 2n } : c,
      ),
    };

    expect(unsafeReason(dutch)).toBe("amount-varies-over-time");
  });

  it("refuses a bundle", () => {
    const base = listing();
    const bundle: OrderParameters = {
      ...base,
      offer: [base.offer[0]!, { ...base.offer[0]!, identifierOrCriteria: 2n }],
    };

    expect(unsafeReason(bundle)).toBe("offer-must-be-one-item");
  });

  it("refuses a bid whose NFT is routed to someone other than the bidder", () => {
    const hostile: OrderParameters = {
      ...offer(),
      consideration: [nft(1n, ATTACKER)],
      totalOriginalConsiderationItems: 1n,
    };

    expect(unsafeReason(hostile)).toBe("bid-nft-must-go-to-the-bidder");
  });

  it("refuses a bid asking to be paid in a different token than it offers", () => {
    const other = "0x9999999999999999999999999999999999999999" as const;
    const base = offer();
    const hostile: OrderParameters = {
      ...base,
      consideration: [base.consideration[0]!, erc20(ONE / 100n, FEE_RECIPIENT, other)],
      totalOriginalConsiderationItems: 2n,
    };

    expect(unsafeReason(hostile)).toBe("bid-consideration-must-be-one-currency");
  });

  /**
   * The counterfeit-currency bid. C1 of the 2026-09-16 review, and the most
   * serious thing found in this codebase so far.
   *
   * Every currency rule in the bid branch used to be *relative* — the
   * consideration had to match whatever the offer named — and nothing said what
   * the offer itself could be. So an attacker deploys an ERC-20 they control,
   * bids 1,000,000 of it for any piece in a collection, and the app renders it
   * as "1,000,000 WSOSO" because the unit is a literal in the markup. It is the
   * best offer on the collection by orders of magnitude. The holder accepts and
   * receives tokens minted from nothing.
   *
   * Note what makes it clean: no fee line, so `outlay` is 0 and the 10% ceiling
   * is satisfied trivially, and the victim needs no ERC-20 allowance at all —
   * only the `setApprovalForAll` they granted the first time they listed.
   */
  it("refuses a bid denominated in a token that is not WSOSO", () => {
    const FAKE = "0xbadbadbadbadbadbadbadbadbadbadbadbadbad0" as const;
    const MILLION = 1_000_000n * ONE;

    const counterfeit: OrderParameters = {
      ...offer({ tokenId: undefined }),
      offerer: ATTACKER,
      offer: [
        {
          itemType: ItemType.ERC20,
          token: FAKE,
          identifierOrCriteria: 0n,
          startAmount: MILLION,
          endAmount: MILLION,
        },
      ],
      // No fee line at all: outlay stays 0, so the outlay ceiling never bites.
      consideration: [
        {
          itemType: ItemType.ERC721_WITH_CRITERIA,
          token: COLLECTION,
          identifierOrCriteria: 0n,
          startAmount: 1n,
          endAmount: 1n,
          recipient: ATTACKER,
        },
      ],
      totalOriginalConsiderationItems: 1n,
    };

    expect(unsafeReason(counterfeit)).toBe("bid-currency-not-accepted");
    expect(readOrder(counterfeit)).toBeUndefined();
  });

  /**
   * The half that already existed only pinned the consideration to the offer.
   * Both halves are needed: this one says the pair must agree, the one above
   * says what they must agree *on*.
   */
  it("still refuses a bid whose consideration disagrees with its offer", () => {
    const other = "0x9999999999999999999999999999999999999999" as const;
    const base = offer();
    const mixed: OrderParameters = {
      ...base,
      consideration: [
        base.consideration[0]!,
        {
          itemType: ItemType.ERC20,
          token: other,
          identifierOrCriteria: 0n,
          startAmount: ONE / 100n,
          endAmount: ONE / 100n,
          recipient: FEE_RECIPIENT,
        },
      ],
      totalOriginalConsiderationItems: 2n,
    };

    expect(unsafeReason(mixed)).toBe("bid-consideration-must-be-one-currency");
  });

  /**
   * M7's second half: no surface renders a bid's quantity, so a multi-unit bid
   * looked exactly like a single-unit one.
   */
  it("refuses a bid for more than one unit, since no view shows the quantity", () => {
    const base = offer();
    const bulk: OrderParameters = {
      ...base,
      consideration: base.consideration.map((c, i) =>
        i === 0 ? { ...c, startAmount: 10_000n, endAmount: 10_000n } : c,
      ),
    };

    expect(unsafeReason(bulk)).toBe("bid-quantity-unsupported");
    expect(readOrder(bulk)).toBeUndefined();
  });

  /**
   * The whitelist calls itself "only the shape this app builds" and for a while
   * never looked at three fields that are part of that shape. Found by the
   * verification sweep over the 2026-09-16 review, not by the review itself.
   */
  it("refuses an order that names a zone", () => {
    const zoned: OrderParameters = { ...listing(), zone: ATTACKER };
    expect(unsafeReason(zoned)).toBe("order-names-a-zone");

    const hashed: OrderParameters = { ...listing(), zoneHash: `0x${"11".repeat(32)}` };
    expect(unsafeReason(hashed)).toBe("order-names-a-zone");
  });

  it("refuses a restricted or contract order type", () => {
    for (const orderType of [OrderType.FULL_RESTRICTED, OrderType.PARTIAL_RESTRICTED, 4]) {
      expect(unsafeReason({ ...listing(), orderType })).toBe("order-type-unsupported");
    }
  });

  /**
   * Seaport reads endTime 0 as "no expiry", and so does `isExpired`. An immortal
   * order is the January 2022 OpenSea shape with its one mitigation removed:
   * a stale listing that waits forever for its token to come back.
   */
  it("refuses an order that never expires", () => {
    expect(unsafeReason({ ...listing(), endTime: 0n })).toBe("order-never-expires");
    expect(unsafeReason({ ...offer(), endTime: 0n })).toBe("order-never-expires");
  });

  /**
   * A criteria item carries either zero — "any token in this contract" — or a
   * Merkle root. We can satisfy the first and never the second, because
   * `acceptOffer` sends an empty proof. Showing one we know will revert costs
   * the holder gas to learn nothing.
   */
  it("refuses a criteria bid whose root this app cannot resolve", () => {
    const base = offer({ tokenId: undefined });
    const merkle: OrderParameters = {
      ...base,
      consideration: base.consideration.map((c, i) =>
        i === 0 ? { ...c, identifierOrCriteria: 123_456_789n } : c,
      ),
    };

    expect(unsafeReason(merkle)).toBe("bid-criteria-unresolvable");
    expect(readOrder(merkle)).toBeUndefined();
  });

  it("still accepts a collection-wide bid, whose criteria value is zero", () => {
    const any = offer({ tokenId: undefined });
    expect(unsafeReason(any)).toBeUndefined();
    expect(readOrder(any)?.tokenId).toBeUndefined();
  });

  /** The orders this app builds must of course survive their own gate. */
  it("accepts every shape ValueMint itself builds", () => {
    for (const p of [
      listing(),
      listing({ priceWei: 1n }),
      listing({ amount: 5n }),
      offer(),
      offer({ tokenId: undefined }),
      offer({ priceWei: 1n }),
    ]) {
      expect(unsafeReason(p)).toBeUndefined();
      expect(readOrder(p)).toBeDefined();
    }
  });

  /** A third-party listing that splits proceeds is legitimate and must still show. */
  it("accepts an honest listing with several native payees", () => {
    const base = listing();
    const split: OrderParameters = {
      ...base,
      consideration: [
        ...base.consideration,
        { ...base.consideration[0]!, startAmount: ONE, endAmount: ONE, recipient: BUYER },
      ],
      totalOriginalConsiderationItems: BigInt(base.consideration.length + 1),
    };

    expect(unsafeReason(split)).toBeUndefined();
    expect(readOrder(split)?.priceWei).toBe(TEN + ONE);
  });
});

describe("readOrder", () => {
  it("reads a listing back to the price the buyer pays, fee included", () => {
    const read = readOrder(listing());

    expect(read).toMatchObject({
      kind: "listing",
      collection: COLLECTION,
      tokenId: 1n,
      maker: SELLER,
      currency: zeroAddress,
      priceWei: TEN,
    });
  });

  it("reads a token offer back to the amount the bidder committed", () => {
    const read = readOrder(offer());

    expect(read).toMatchObject({
      kind: "offer",
      collection: COLLECTION,
      tokenId: 1n,
      maker: BUYER,
      currency: WSOSO,
      priceWei: TEN,
    });
  });

  it("reports a collection offer as naming no token", () => {
    const read = readOrder(offer({ tokenId: undefined }));

    expect(read?.kind).toBe("offer");
    expect(read?.tokenId).toBeUndefined();
    expect(read?.collection).toBe(COLLECTION);
  });

  /**
   * A Merkle-root criteria offer is a valid Seaport order that this app cannot
   * resolve into a token list. Reporting it as a bid on token
   * 0x8f3c…-as-a-number would be worse than declining to narrow it.
   */
  it("does not mistake a Merkle criteria root for a token id", () => {
    const p = offer({ tokenId: undefined });
    const nft = p.consideration.find((c) => c.token === COLLECTION);
    const withRoot: OrderParameters = {
      ...p,
      consideration: p.consideration.map((c) =>
        c === nft ? { ...c, identifierOrCriteria: 123_456_789n } : c,
      ),
    };

    expect(readOrder(withRoot)?.tokenId).toBeUndefined();
  });

  it("declines orders it cannot price rather than guessing", () => {
    const p = listing();
    const noCurrency: OrderParameters = {
      ...p,
      consideration: [],
      totalOriginalConsiderationItems: 0n,
    };

    expect(readOrder(noCurrency)).toBeUndefined();
  });

  /**
   * A listing where the seller splits proceeds across several payees still has
   * one price: what the buyer hands over. Summing only the first item would
   * under-quote it, and the buyer's transaction would revert for underpayment.
   */
  it("sums every payee into one price", () => {
    const p = listing();
    const split: OrderParameters = {
      ...p,
      consideration: [
        ...p.consideration,
        { ...p.consideration[0]!, startAmount: ONE, endAmount: ONE, recipient: BUYER },
      ],
      totalOriginalConsiderationItems: BigInt(p.consideration.length + 1),
    };

    expect(readOrder(split)?.priceWei).toBe(TEN + ONE);
  });
});

/**
 * The unit-vs-lot conversion, in both directions.
 *
 * This is the one arithmetic mistake in the app that costs real money silently.
 * Seaport prices the lot; every screen shows a price each. Pass a unit price
 * through as the order total and ten editions are listed for the price of one —
 * no error, no warning, and the first buyer takes all ten at a tenth of what the
 * seller meant.
 */
describe("unit and lot prices", () => {
  it("round-trips through a listing", () => {
    const each = ONE / 2n; // 0.5 SOSO each
    const p = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      amount: 10n,
      priceWei: lotPrice(each, 10n),
    });

    const read = readOrder(p);
    expect(read?.priceWei).toBe(5n * ONE); // the lot
    expect(unitPrice(read!.priceWei, read!.amount)).toBe(each); // back to each
  });

  it("treats a single item's lot price as its unit price", () => {
    expect(lotPrice(TEN, 1n)).toBe(TEN);
    expect(unitPrice(TEN, 1n)).toBe(TEN);
  });

  /** Never divide by zero; a malformed order should read as a price, not throw. */
  it("survives a zero quantity", () => {
    expect(unitPrice(TEN, 0n)).toBe(TEN);
  });
});

describe("readFulfilment", () => {
  const nft = (id: bigint, amount = 1n) => ({
    itemType: ItemType.ERC721,
    token: COLLECTION,
    identifier: id,
    amount,
  });
  const native = (amount: bigint, to: `0x${string}`) => ({
    itemType: ItemType.NATIVE,
    token: zeroAddress as `0x${string}`,
    identifier: 0n,
    amount,
    recipient: to,
  });
  const erc20 = (amount: bigint, to: `0x${string}`) => ({
    itemType: ItemType.ERC20,
    token: WSOSO,
    identifier: 0n,
    amount,
    recipient: to,
  });

  it("reads a filled listing: the offerer sold to the fulfiller", () => {
    const { fee, net } = splitFee(TEN);
    const out = readFulfilment(SELLER, BUYER, [nft(1n)], [
      native(net, SELLER),
      native(fee, FEE_RECIPIENT),
    ]);

    expect(out).toEqual({
      collection: COLLECTION,
      tokenId: 1n,
      amount: 1n,
      priceWei: TEN,
      currency: zeroAddress,
      seller: SELLER,
      buyer: BUYER,
    });
  });

  /**
   * The direction that is easy to get backwards. On an accepted bid the offerer
   * is the *buyer* and the fulfiller is the seller - the opposite of a listing.
   * Assuming the offerer always sold would put every accepted offer in the feed
   * with the two parties swapped, and the volume total would not notice.
   */
  it("reads an accepted bid: the offerer bought from the fulfiller", () => {
    const { fee } = splitFee(TEN);
    const out = readFulfilment(
      BUYER,
      SELLER,
      [{ itemType: ItemType.ERC20, token: WSOSO, identifier: 0n, amount: TEN }],
      [
        { itemType: ItemType.ERC721, token: COLLECTION, identifier: 7n, amount: 1n, recipient: BUYER },
        erc20(fee, FEE_RECIPIENT),
      ],
    );

    expect(out).toMatchObject({
      collection: COLLECTION,
      tokenId: 7n,
      seller: SELLER,
      buyer: BUYER,
      priceWei: TEN,
      currency: WSOSO,
    });
  });

  it("counts every payee into the sale price", () => {
    const out = readFulfilment(SELLER, BUYER, [nft(1n)], [
      native(ONE, SELLER),
      native(ONE, FEE_RECIPIENT),
      native(ONE, BUYER),
    ]);
    expect(out?.priceWei).toBe(3n * ONE);
  });

  it("carries the quantity of an edition sale", () => {
    const out = readFulfilment(SELLER, BUYER, [nft(1n, 4n)], [native(TEN, SELLER)]);
    expect(out?.amount).toBe(4n);
  });

  it("ignores a settlement with no NFT on either side", () => {
    expect(readFulfilment(SELLER, BUYER, [], [native(TEN, SELLER)])).toBeUndefined();
  });

  /**
   * Sale history is a price signal, and an ungated one is C1 again — found by
   * the verification sweep, in the same file, untouched by C1's own fix.
   *
   * `readOrder` refuses what it cannot describe truthfully; `readFulfilment` had
   * no such gate, `useActivity` dropped the currency, and `Activity` rendered
   * the number with no unit at all. So an attacker wash-trading with a token
   * they minted would show "last sale 1,000,000" to every visitor who came to
   * value the piece. Asking prices are cheap talk; history is what a buyer
   * checks instead, which is exactly why it must not be forgeable.
   */
  const FAKE = "0xbadbadbadbadbadbadbadbadbadbadbadbadbad0" as const;

  it("refuses a sale settled in an unrecognised currency", () => {
    const out = readFulfilment(SELLER, BUYER, [nft(1n)], [
      { itemType: ItemType.ERC20, token: FAKE, identifier: 0n, amount: 1_000_000n * ONE, recipient: SELLER },
    ]);
    expect(out).toBeUndefined();
  });

  it("refuses an accepted bid settled in an unrecognised currency", () => {
    const out = readFulfilment(
      BUYER,
      SELLER,
      [{ itemType: ItemType.ERC20, token: FAKE, identifier: 0n, amount: 1_000_000n * ONE }],
      [{ itemType: ItemType.ERC721, token: COLLECTION, identifier: 7n, amount: 1n, recipient: BUYER }],
    );
    expect(out).toBeUndefined();
  });

  it("still reports genuine sales in SOSO and WSOSO", () => {
    expect(readFulfilment(SELLER, BUYER, [nft(1n)], [native(TEN, SELLER)])?.priceWei).toBe(TEN);
    expect(
      readFulfilment(
        BUYER,
        SELLER,
        [{ itemType: ItemType.ERC20, token: WSOSO, identifier: 0n, amount: TEN }],
        [{ itemType: ItemType.ERC721, token: COLLECTION, identifier: 7n, amount: 1n, recipient: BUYER }],
      )?.priceWei,
    ).toBe(TEN);
  });
});

describe("toComponents", () => {
  it("swaps the consideration count for the offerer's counter", () => {
    const p = listing();
    const c = toComponents(p, 3n);

    expect(c.counter).toBe(3n);
    expect(c).not.toHaveProperty("totalOriginalConsiderationItems");
    expect(c.salt).toBe(p.salt);
    expect(c.offer).toEqual(p.offer);
  });
});

/**
 * The rule that decides whether somebody is shown a price they can actually
 * pay. Measured against live chain state on 2026-09-16: a Larper listed at 10
 * SOSO whose seller had since accepted a bid on it was still `validated=true,
 * cancelled=false, filled=0/0` — perfectly open as far as Seaport was concerned,
 * and unfillable in fact.
 */
describe("listingIsFillable", () => {
  const order = { maker: SELLER as `0x${string}`, amount: 1n };

  it("is true while the seller still holds the token and Seaport may move it", () => {
    expect(listingIsFillable(order, SELLER, true)).toBe(true);
  });

  /** The exact case seen on chain: the token was sold out from under the listing. */
  it("is false once the token belongs to somebody else", () => {
    expect(listingIsFillable(order, BUYER, true)).toBe(false);
  });

  it("is false when approval has been revoked, however owns it", () => {
    expect(listingIsFillable(order, SELLER, false)).toBe(false);
  });

  it("compares addresses without caring about case", () => {
    expect(listingIsFillable(order, SELLER.toUpperCase().replace("0X", "0x") as `0x${string}`, true)).toBe(
      true,
    );
  });

  it("uses a balance for editions, not an owner", () => {
    const lot = { maker: SELLER as `0x${string}`, amount: 5n };
    expect(listingIsFillable(lot, 5n, true)).toBe(true);
    expect(listingIsFillable(lot, 4n, true)).toBe(false);
  });
});

describe("offerIsFillable", () => {
  const order = { priceWei: TEN };

  it("is true when the bidder has both the funds and the allowance", () => {
    expect(offerIsFillable(order, TEN, TEN)).toBe(true);
  });

  it("is false once the bidder has spent the money", () => {
    expect(offerIsFillable(order, TEN - 1n, TEN)).toBe(false);
  });

  it("is false when the allowance no longer covers it", () => {
    expect(offerIsFillable(order, TEN, TEN - 1n)).toBe(false);
  });
});

describe("orderBookFloor", () => {
  const DEPLOYED = 14_407_869n;

  it("reads from the deployment while the chain is young", () => {
    expect(orderBookFloor(DEPLOYED + 2_000n, DEPLOYED)).toBe(DEPLOYED);
    expect(orderBookFloor(DEPLOYED + ORDER_BOOK_WINDOW_BLOCKS, DEPLOYED)).toBe(DEPLOYED);
  });

  it("never reads earlier than the deployment", () => {
    expect(orderBookFloor(DEPLOYED + ORDER_BOOK_WINDOW_BLOCKS + 1_000n, DEPLOYED)).toBeGreaterThanOrEqual(
      DEPLOYED,
    );
  });

  it("stops the window growing once the chain is older than it", () => {
    const head = DEPLOYED + ORDER_BOOK_WINDOW_BLOCKS * 3n;
    const floor = orderBookFloor(head, DEPLOYED);

    expect(head - floor).toBeLessThanOrEqual(ORDER_BOOK_WINDOW_BLOCKS + 250_000n);
    expect(floor).toBeGreaterThan(DEPLOYED);
  });

  /**
   * The trap this rounding exists for.
   *
   * The floor is derived from the head, and the head moves every two seconds.
   * Unrounded, every 30-second poll would ask for a slightly different
   * `fromBlock` — a different cache key in logScan — and re-read the entire
   * window from scratch each time. The cache would never hit once.
   */
  it("does not move as blocks are mined, so the scan stays cached", () => {
    const head = DEPLOYED + ORDER_BOOK_WINDOW_BLOCKS * 2n;
    const first = orderBookFloor(head, DEPLOYED);

    // Two hours of blocks later, at ValueChain's rate.
    for (const later of [1n, 30n, 1_000n, 3_500n]) {
      expect(orderBookFloor(head + later, DEPLOYED)).toBe(first);
    }
  });

  /** The window must outlast the longest order the app can create. */
  it("covers more than the 90 days an order can stand for", () => {
    const blocksPerDay = (86_400n * 1000n) / 2_070n; // ~2.07s blocks
    expect(ORDER_BOOK_WINDOW_BLOCKS).toBeGreaterThan(blocksPerDay * 90n);
  });
});

describe("isExpired", () => {
  it("is true once the end time has been reached", () => {
    expect(isExpired(1_000n, 999)).toBe(false);
    expect(isExpired(1_000n, 1_000)).toBe(true);
    expect(isExpired(1_000n, 1_001)).toBe(true);
  });

  /** Seaport treats endTime 0 as no expiry; nothing here builds one, but a stranger's order might. */
  it("treats a zero end time as never expiring", () => {
    expect(isExpired(0n, 2_000_000_000)).toBe(false);
  });
});

/**
 * The gap this closes: the UI computed an acceptor's cost from our own FEE_BPS
 * (2.5%) while `unsafeReason` admits bids charging up to
 * MAX_FULFILLER_OUTLAY_BPS (10%). A holder with a standing WSOSO allowance —
 * anyone who has bid before — would have settled at the higher figure while
 * being shown the lower one.
 */
describe("fulfillerOutlay", () => {
  const erc20 = (amount: bigint) => ({
    itemType: 1,
    token: WSOSO,
    identifierOrCriteria: 0n,
    startAmount: amount,
    endAmount: amount,
    recipient: SELLER,
  });
  const nft = {
    itemType: 2,
    token: COLLECTION,
    identifierOrCriteria: 7n,
    startAmount: 1n,
    endAmount: 1n,
    recipient: BUYER,
  };

  it("counts nothing when a bid charges the acceptor nothing", () => {
    expect(fulfillerOutlay({ consideration: [nft] } as never)).toBe(0n);
  });

  it("reports our own 2.5% fee line", () => {
    const p = { consideration: [nft, erc20(25n)] } as never;
    expect(fulfillerOutlay(p)).toBe(25n);
  });

  it("reports a third-party fee larger than our own rate", () => {
    // 10% on a 1000 bid — admitted by unsafeReason, and previously displayed
    // to the holder as 2.5%.
    const p = { consideration: [nft, erc20(100n)] } as never;
    expect(fulfillerOutlay(p)).toBe(100n);
  });

  it("sums every currency line rather than trusting the first", () => {
    const p = { consideration: [nft, erc20(25n), erc20(60n)] } as never;
    expect(fulfillerOutlay(p)).toBe(85n);
  });

  it("never counts the NFT the acceptor is handing over", () => {
    const p = { consideration: [nft] } as never;
    expect(fulfillerOutlay(p)).toBe(0n);
  });
});

describe("unsafeReason - gaps closed after the 2026-09-17 review", () => {
  /**
   * The whitelist and the pricing function disagreed about the same item.
   * `unsafeReason` checked `itemType === NATIVE`; `sumOf` additionally required
   * `token === zeroAddress`, so an item with a non-zero token passed the gate
   * and was skipped when adding up the price.
   */
  it("refuses a NATIVE consideration item carrying a non-zero token", () => {
    const order = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: TEN,
    });
    const poisoned = {
      ...order,
      consideration: [
        { ...order.consideration[0]!, startAmount: 1n, endAmount: 1n },
        {
          ...order.consideration[0]!,
          token: "0x0000000000000000000000000000000000000001" as const,
          startAmount: TEN,
          endAmount: TEN,
        },
      ],
      totalOriginalConsiderationItems: 2n,
    };
    expect(unsafeReason(poisoned)).toBe("listing-consideration-must-be-native");
  });

  it("refuses a NATIVE consideration item carrying a non-zero identifier", () => {
    const order = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: TEN,
    });
    const odd = {
      ...order,
      consideration: order.consideration.map((c) => ({ ...c, identifierOrCriteria: 5n })),
    };
    expect(unsafeReason(odd)).toBe("listing-consideration-must-be-native");
  });

  /**
   * Seaport treats totalOriginalConsiderationItems as what the offerer
   * committed to; a fulfiller may append past it. An order where the declared
   * count disagrees with the array is not a shape this app builds.
   */
  it("refuses an order whose declared consideration count is a lie", () => {
    const order = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: TEN,
    });
    expect(unsafeReason({ ...order, totalOriginalConsiderationItems: 1n })).toBe(
      "order-type-unsupported",
    );
    expect(unsafeReason({ ...order, totalOriginalConsiderationItems: 99n })).toBe(
      "order-type-unsupported",
    );
  });

  it("still accepts the orders this app itself builds", () => {
    const listing = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: TEN,
    });
    expect(unsafeReason(listing)).toBeUndefined();
  });
});

describe("readFulfilment - self-fill", () => {
  const nftOut = [
    { itemType: 2, token: COLLECTION, identifier: 1n, amount: 1n },
  ] as never;
  const paid = (to: string) =>
    [
      {
        itemType: 0,
        token: "0x0000000000000000000000000000000000000000",
        identifier: 0n,
        amount: TEN,
        recipient: to,
      },
    ] as never;

  it("reads a genuine sale between two parties", () => {
    const f = readFulfilment(SELLER, BUYER, nftOut, paid(SELLER));
    expect(f).toBeDefined();
    expect(f?.priceWei).toBe(TEN);
  });

  /**
   * Filling your own order costs gas and moves nothing, but it used to write a
   * "last sale" at any figure you chose — and every price signal on the site is
   * built from these rows.
   */
  it("refuses a trade where the offerer is also the fulfiller", () => {
    expect(readFulfilment(SELLER, SELLER, nftOut, paid(SELLER))).toBeUndefined();
  });

  it("refuses it regardless of address casing", () => {
    expect(
      readFulfilment(SELLER.toLowerCase() as typeof SELLER, SELLER, nftOut, paid(SELLER)),
    ).toBeUndefined();
  });
});

describe("low-severity gaps closed 2026-09-17", () => {
  it("refuses an ERC-721 listing that offers more than one", () => {
    const order = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: TEN,
    });
    const greedy = {
      ...order,
      offer: [{ ...order.offer[0]!, startAmount: 10n, endAmount: 10n }],
    };
    expect(unsafeReason(greedy)).toBe("offer-item-type-unsupported");
  });

  it("still accepts a single-token listing", () => {
    const order = buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: TEN,
    });
    expect(unsafeReason(order)).toBeUndefined();
  });
});


/**
 * The three-state rule.
 *
 * This is the branch that decides whether a stranger is shown a Buy button, so
 * the interesting cases are the ones where the app does NOT know the answer —
 * those are the ones that have been wrong, in both directions.
 */
describe("resolveFillable", () => {
  const listing = {
    maker: SELLER as `0x${string}`,
    amount: 1n,
    priceWei: 1n,
    kind: "listing" as const,
    params: { offer: [{ itemType: ItemType.ERC721 }] },
  };
  const ok = (result: unknown) => ({ status: "success" as const, result });
  const reverted = { status: "failure" as const };

  it("is fillable when the seller still holds it and Seaport may move it", () => {
    expect(resolveFillable(listing, { first: ok(SELLER), second: ok(true) })).toBe(true);
  });

  /**
   * The whole reason this was extracted.
   *
   * Six listings were in this state on chain when it was found: their tokens
   * had been sold by accepting an offer, which leaves the listing valid because
   * Seaport tracks cancellation and fills and nothing else. Until the reads
   * land the app does not know that, and "I have not checked" must never render
   * a Buy button — the click costs the buyer gas on a revert.
   */
  it("is NOT fillable while the checks are still in flight", () => {
    expect(resolveFillable(listing, undefined)).toBe(false);
  });

  /** An id that does not exist: `ownerOf` reverts, and that is an answer. */
  it("is not fillable when a read reverted", () => {
    expect(resolveFillable(listing, { first: reverted, second: ok(true) })).toBe(false);
    expect(resolveFillable(listing, { first: ok(SELLER), second: reverted })).toBe(false);
  });

  it("is not fillable once the token belongs to somebody else", () => {
    expect(resolveFillable(listing, { first: ok(BUYER), second: ok(true) })).toBe(false);
  });

  it("is not fillable when approval was revoked", () => {
    expect(resolveFillable(listing, { first: ok(SELLER), second: ok(false) })).toBe(false);
  });

  it("uses a balance rather than an owner for an edition", () => {
    const edition = { ...listing, amount: 3n, params: { offer: [{ itemType: ItemType.ERC1155 }] } };
    expect(resolveFillable(edition, { first: ok(3n), second: ok(true) })).toBe(true);
    expect(resolveFillable(edition, { first: ok(2n), second: ok(true) })).toBe(false);
  });

  describe("bids", () => {
    const bid = {
      maker: BUYER as `0x${string}`,
      amount: 1n,
      priceWei: 100n,
      kind: "offer" as const,
      params: { offer: [{ itemType: ItemType.ERC20 }] },
    };

    it("needs both the balance and the allowance to cover it", () => {
      expect(resolveFillable(bid, { first: ok(100n), second: ok(100n) })).toBe(true);
      expect(resolveFillable(bid, { first: ok(99n), second: ok(100n) })).toBe(false);
      expect(resolveFillable(bid, { first: ok(100n), second: ok(99n) })).toBe(false);
    });

    /** A seller must not be shown Accept against a bid nobody has checked. */
    it("is NOT fillable while the checks are still in flight", () => {
      expect(resolveFillable(bid, undefined)).toBe(false);
    });
  });
});
