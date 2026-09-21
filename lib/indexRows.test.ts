import { describe, expect, it } from "vitest";
import { zeroAddress, parseEther } from "viem";
import { buildListing, buildOffer, ItemType, type OrderParameters } from "./seaport";
import { counterRows, decodeParams, encodeParams, eventRow, orderRow, orderRows } from "./indexRows";
import { deployment } from "@/config/contracts";

/**
 * The index is a cache, and a cache that quietly disagrees with its source is
 * worse than no cache at all.
 *
 * Every failure these tests guard is silent. A bigint that does not survive the
 * round trip produces an order Seaport refuses, at the wallet, after the
 * visitor has decided to buy. An address stored with the case the chain
 * happened to emit matches some of a collection's listings and misses the rest,
 * because Postgres compares text exactly. Keeping the earliest validation
 * rather than the latest hides a re-listed order from its own seller.
 *
 * None of that throws. So it is asserted instead.
 */

const SELLER = "0x1111111111111111111111111111111111111111" as const;
const BUYER = "0x2222222222222222222222222222222222222222" as const;
/** Deliberately mixed case, exactly as the explorer and the chain report it. */
const COLLECTION = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B" as const;

const HASH = "0xAbCd000000000000000000000000000000000000000000000000000000000001" as const;
const TEN = parseEther("10");
const AT = new Date("2026-09-21T12:00:00.000Z");

const listing = (over: Partial<Parameters<typeof buildListing>[0]> = {}) =>
  buildListing({ seller: SELLER, collection: COLLECTION, tokenId: 1n, priceWei: TEN, ...over });

describe("encodeParams / decodeParams", () => {
  /**
   * The whole point of the pair. `JSON.stringify` throws on a bigint rather
   * than rounding one, so the failure this protects against is not a crash —
   * it is a `Number()` somewhere in a future refactor turning a 77-digit salt
   * into an approximation, and Seaport then refusing an order nobody can
   * explain.
   */
  it("survives a full JSON round trip with every bigint intact", () => {
    const original = listing();
    const back = decodeParams(JSON.parse(JSON.stringify(encodeParams(original))));

    expect(back).toEqual(original);
  });

  it("keeps a salt too large for a double exactly", () => {
    const salt = 2n ** 255n - 1n;
    const original: OrderParameters = { ...listing(), salt };
    const back = decodeParams(JSON.parse(JSON.stringify(encodeParams(original))));

    expect(back.salt).toBe(salt);
    expect(back.salt.toString()).toBe(salt.toString());
  });

  it("keeps a wei amount past the safe integer range", () => {
    const price = parseEther("123456.789");
    const original = listing({ priceWei: price });
    const back = decodeParams(JSON.parse(JSON.stringify(encodeParams(original))));

    const paid = back.consideration.reduce((n, c) => n + c.startAmount, 0n);
    expect(paid).toBe(price);

    /**
     * And this is why it had to be a string. The same value through a JSON
     * number comes back a different number — which is the exact shape of the
     * bug the `price_wei::text` casts in the schema exist to prevent.
     */
    expect(price > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(BigInt(Number(price))).not.toBe(price);
  });
});

describe("orderRow", () => {
  it("reads a listing the way the site reads it", () => {
    const row = orderRow(HASH, listing(), 14_500_000n, AT);

    expect(row).toBeDefined();
    expect(row?.side).toBe("listing");
    expect(row?.token_id).toBe("1");
    expect(row?.price_wei).toBe(TEN.toString());
    expect(row?.currency).toBe(zeroAddress);
    expect(row?.block_number).toBe(14_500_000);
  });

  /**
   * Postgres compares text exactly and the chain does not agree with itself
   * about case — an event carries whatever the caller encoded. A collection
   * queried as `eq.0xcd30…` against rows stored as `0xCD30…` returns nothing,
   * which reads as "no listings" rather than as a bug.
   */
  it("lower-cases every address it stores", () => {
    const row = orderRow(HASH, listing(), 1n, AT);

    expect(row?.collection).toBe(COLLECTION.toLowerCase());
    expect(row?.order_hash).toBe(HASH.toLowerCase());
    expect(row?.offerer).toBe(SELLER.toLowerCase());
    expect(row?.collection).not.toBe(COLLECTION);
  });

  /** The params are carried verbatim, so the case the chain used is still there to fill with. */
  it("leaves the stored parameters untouched by that lower-casing", () => {
    const row = orderRow(HASH, listing(), 1n, AT);

    expect(row?.params.offer[0]?.token).toBe(COLLECTION);
  });

  it("produces a row that JSON.stringify accepts", () => {
    const row = orderRow(HASH, listing(), 1n, AT);

    expect(() => JSON.stringify(row)).not.toThrow();
  });

  /**
   * A shape this marketplace cannot price is left out rather than guessed at.
   * Indexing a bundle as though it were a single sale would put a figure on a
   * card that describes nothing on screen.
   */
  it("declines an order it cannot price", () => {
    const bundle: OrderParameters = {
      ...listing(),
      consideration: [],
    };

    expect(orderRow(HASH, bundle, 1n, AT)).toBeUndefined();
  });

  describe("offers", () => {
    const collectionOffer = buildOffer({
      bidder: BUYER,
      collection: COLLECTION,
      priceWei: TEN,
    });

    it("reads a collection-wide bid as having no token", () => {
      const row = orderRow(HASH, collectionOffer, 1n, AT);

      expect(row?.side).toBe("offer");
      expect(row?.token_id).toBeNull();
      expect(row?.currency).toBe(deployment.wsoso.toLowerCase());
    });

    /**
     * Kept because it is what a trait-level offer would eventually be built on.
     * Zero means "any token"; a non-zero value is a Merkle root the app cannot
     * yet resolve. Discarding it now would mean re-reading the chain to get it
     * back.
     */
    it("keeps the criteria a bid names", () => {
      const row = orderRow(HASH, collectionOffer, 1n, AT);

      expect(row?.criteria).toBe("0");
    });

    it("leaves criteria null on an order that names its token outright", () => {
      expect(orderRow(HASH, listing(), 1n, AT)?.criteria).toBeNull();
    });

    it("stores a bid on one token with that token", () => {
      const single = buildOffer({
        bidder: BUYER,
        collection: COLLECTION,
        tokenId: 7n,
        priceWei: TEN,
      });
      const row = orderRow(HASH, single, 1n, AT);

      expect(row?.token_id).toBe("7");
    });
  });
});

describe("orderRows", () => {
  const params = listing();

  /**
   * The rule the counter check depends on.
   *
   * `validate()` is idempotent and each call emits its own event, so the same
   * order arrives more than once. `block_number` is what decides whether an
   * order survives its maker's `incrementCounter`, so keeping the first
   * announcement hides any order that was voided and then re-listed: live on
   * chain, invisible on the site. That bug has been fixed once already in
   * `useSeaportOrders`; this holds the same rule in the same direction.
   */
  it("keeps the latest validation of an order, not the first", () => {
    const rows = orderRows(
      [
        { hash: HASH, params, blockNumber: 100n },
        { hash: HASH, params, blockNumber: 900n },
        { hash: HASH, params, blockNumber: 500n },
      ],
      AT,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.block_number).toBe(900);
  });

  it("treats hashes differing only in case as one order", () => {
    const rows = orderRows(
      [
        { hash: HASH, params, blockNumber: 1n },
        { hash: HASH.toLowerCase() as typeof HASH, params, blockNumber: 2n },
      ],
      AT,
    );

    expect(rows).toHaveLength(1);
  });

  it("drops the shapes it cannot price without dropping the rest", () => {
    const rows = orderRows(
      [
        { hash: HASH, params, blockNumber: 1n },
        {
          hash: "0xdead000000000000000000000000000000000000000000000000000000000002",
          params: { ...params, consideration: [] },
          blockNumber: 2n,
        },
      ],
      AT,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.order_hash).toBe(HASH.toLowerCase());
  });

  it("returns nothing for nothing", () => {
    expect(orderRows([], AT)).toEqual([]);
  });
});

describe("counterRows", () => {
  it("keeps the highest block an offerer voided at", () => {
    const rows = counterRows([
      { offerer: SELLER, blockNumber: 10n },
      { offerer: SELLER, blockNumber: 40n },
      { offerer: SELLER, blockNumber: 25n },
    ]);

    expect(rows).toEqual([{ offerer: SELLER.toLowerCase(), voided_after_block: 40 }]);
  });

  it("keeps offerers apart", () => {
    const rows = counterRows([
      { offerer: SELLER, blockNumber: 10n },
      { offerer: BUYER, blockNumber: 5n },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.offerer === BUYER.toLowerCase())?.voided_after_block).toBe(5);
  });

  /** Block zero is a real block, and `?? -1` rather than `?? 0` is what keeps it. */
  it("records a void at block zero", () => {
    expect(counterRows([{ offerer: SELLER, blockNumber: 0n }])).toEqual([
      { offerer: SELLER.toLowerCase(), voided_after_block: 0 },
    ]);
  });
});

describe("what the row is for", () => {
  /**
   * The safety property the whole design rests on, asserted rather than
   * asserted-in-prose: what comes out of the database is enough to fill the
   * order, and it is byte-identical to what went in. If this ever fails, the
   * index has stopped being a cache and started being a second opinion.
   */
  it("round-trips a row through the database's own shape", () => {
    const original = listing();
    const row = orderRow(HASH, original, 1n, AT);
    const overTheWire = JSON.parse(JSON.stringify(row)) as NonNullable<typeof row>;

    expect(decodeParams(overTheWire.params)).toEqual(original);
  });

  it("agrees with the params about what the buyer pays", () => {
    const row = orderRow(HASH, listing(), 1n, AT);
    const fromParams = decodeParams(row!.params)
      .consideration.filter((c) => c.itemType === ItemType.NATIVE)
      .reduce((n, c) => n + c.startAmount, 0n);

    expect(fromParams.toString()).toBe(row?.price_wei);
  });
});

describe("eventRow filter columns", () => {
  const log = (over: Record<string, unknown> = {}) => ({
    transactionHash: "0xTX00000000000000000000000000000000000000000000000000000000000001",
    logIndex: 3,
    blockNumber: 500n,
    args: { orderHash: HASH, orderParameters: listing() },
    ...over,
  });

  it("keys a validation by its collection, token and maker", () => {
    const row = eventRow("validated", log());

    expect(row?.collection).toBe(COLLECTION.toLowerCase());
    expect(row?.token_id).toBe("1");
    expect(row?.maker).toBe(SELLER.toLowerCase());
    expect(row?.taker).toBeNull();
  });

  it("keys a log by where it happened, so re-reading a range collides with itself", () => {
    const a = eventRow("validated", log());
    const b = eventRow("validated", log());

    expect(a?.tx_hash).toBe(b?.tx_hash);
    expect(a?.log_index).toBe(b?.log_index);
    expect(a?.tx_hash).toBe(a?.tx_hash.toLowerCase());
  });

  it("refuses a log it cannot key", () => {
    expect(eventRow("validated", log({ transactionHash: null }))).toBeUndefined();
    expect(eventRow("validated", log({ logIndex: null }))).toBeUndefined();
  });

  describe("fulfilments", () => {
    const sale = (consideration: unknown[]) =>
      log({
        args: {
          orderHash: HASH,
          offerer: SELLER,
          recipient: BUYER,
          offer: [{ itemType: ItemType.ERC721, token: COLLECTION, identifier: 9n, amount: 1n }],
          consideration,
        },
      });

    it("keys a sale by both parties", () => {
      const row = eventRow(
        "fulfilled",
        sale([
          {
            itemType: ItemType.NATIVE,
            token: zeroAddress,
            identifier: 0n,
            amount: TEN,
            recipient: SELLER,
          },
        ]),
      );

      expect(row?.collection).toBe(COLLECTION.toLowerCase());
      expect(row?.token_id).toBe("9");
      expect(row?.maker).toBe(SELLER.toLowerCase());
      expect(row?.taker).toBe(BUYER.toLowerCase());
    });

    /**
     * The gate, applied where it decides what a query returns.
     *
     * A wash trade settled in a token the attacker minted must not merely
     * display as nothing — with no collection it never comes back from that
     * collection's feed at all.
     */
    it("leaves a sale in an unrecognised currency unfiled", () => {
      const row = eventRow(
        "fulfilled",
        sale([
          {
            itemType: ItemType.ERC20,
            token: "0x9999999999999999999999999999999999999999",
            identifier: 0n,
            amount: 10n ** 24n,
            recipient: SELLER,
          },
        ]),
      );

      expect(row).toBeDefined();
      expect(row?.collection).toBeNull();
      expect(row?.token_id).toBeNull();
    });
  });

  describe("cancellations", () => {
    const cancel = log({ args: { orderHash: HASH, offerer: SELLER } });

    /**
     * `OrderCancelled` carries only a hash. Without the lookup a cancellation
     * cannot be filed under its own collection, and would vanish from that
     * collection's feed the moment the query was narrowed.
     */
    it("files a cancellation under whatever the lookup says", () => {
      const row = eventRow("cancelled", cancel, () => ({
        collection: COLLECTION,
        tokenId: "42",
      }));

      expect(row?.collection).toBe(COLLECTION.toLowerCase());
      expect(row?.token_id).toBe("42");
      expect(row?.maker).toBe(SELLER.toLowerCase());
    });

    it("still stores a cancellation whose order it cannot find", () => {
      const row = eventRow("cancelled", cancel, () => undefined);

      expect(row).toBeDefined();
      expect(row?.collection).toBeNull();
    });
  });
});
