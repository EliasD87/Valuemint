import { describe, expect, it } from "vitest";
import { parseEther, zeroAddress } from "viem";
import { buildActivityRows, type ActivityLog } from "./activityRows";
import { buildListing, buildOffer, ItemType } from "./seaport";

/**
 * The feed is built from two sources now — scanned logs and the index — and
 * they must produce byte-identical rows.
 *
 * That is the whole reason this function was lifted out of `useActivity`. A
 * rule left inside the scanned path is a rule the cached path walks past, and
 * the rules here are not cosmetic: which token a cancellation freed, whether a
 * settlement currency is one this marketplace recognises, and whether an empty
 * feed means "nothing traded" or "nothing could be read".
 */

const SELLER = "0x1111111111111111111111111111111111111111" as const;
const BUYER = "0x2222222222222222222222222222222222222222" as const;
const COLLECTION = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B" as const;
const HASH = "0xaaaa000000000000000000000000000000000000000000000000000000000001";

const TEN = parseEther("10");

const validatedLog = (
  tokenId: bigint,
  blockNumber: bigint,
  hash = HASH,
  logIndex = 0,
): ActivityLog => ({
  args: {
    orderHash: hash,
    orderParameters: buildListing({
      seller: SELLER,
      collection: COLLECTION,
      tokenId,
      priceWei: TEN,
    }),
  },
  blockNumber,
  logIndex,
});

/** A settled listing, in the shape `OrderFulfilled` reports rather than asks. */
const saleLog = (
  tokenId: bigint,
  blockNumber: bigint,
  { amount = 1n, priceWei = TEN, logIndex = 0 } = {},
): ActivityLog => ({
  args: {
    orderHash: HASH,
    offerer: SELLER,
    recipient: BUYER,
    offer: [
      {
        itemType: amount > 1n ? ItemType.ERC1155 : ItemType.ERC721,
        token: COLLECTION,
        identifier: tokenId,
        amount,
      },
    ],
    consideration: [
      {
        itemType: ItemType.NATIVE,
        token: zeroAddress,
        identifier: 0n,
        amount: priceWei,
        recipient: SELLER,
      },
    ],
  },
  blockNumber,
  logIndex,
});

describe("buildActivityRows", () => {
  it("reads a validation as a listing", () => {
    const rows = buildActivityRows({ validated: [validatedLog(1n, 100n)] });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "listed", tokenId: 1n, from: SELLER, price: TEN });
  });

  it("reads a fulfilment as a sale, with both parties", () => {
    const rows = buildActivityRows({ fulfilled: [saleLog(7n, 200n)] });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "sale", tokenId: 7n, from: SELLER, to: BUYER });
  });

  /** So an edition sale sits on the same scale as a single piece. */
  it("prices a multi-unit sale per unit", () => {
    const rows = buildActivityRows({
      fulfilled: [saleLog(7n, 200n, { amount: 4n, priceWei: parseEther("40") })],
    });

    expect(rows[0]?.price).toBe(parseEther("10"));
    expect(rows[0]?.amount).toBe(4n);
  });

  describe("cancellations", () => {
    const cancelLog: ActivityLog = {
      args: { orderHash: HASH, offerer: SELLER },
      blockNumber: 300n,
      logIndex: 1,
    };

    /**
     * `OrderCancelled` carries only a hash. The token is recoverable only from
     * that order's own `OrderValidated`, which is why the index stores all
     * three event kinds rather than only sales.
     */
    it("names the token a cancellation freed, from the matching validation", () => {
      const rows = buildActivityRows({
        validated: [validatedLog(42n, 100n)],
        cancelled: [cancelLog],
      });

      const cancelled = rows.find((r) => r.kind === "cancelled");
      expect(cancelled).toMatchObject({ tokenId: 42n, collection: COLLECTION });
    });

    it("drops a cancellation whose order was never validated on chain", () => {
      const rows = buildActivityRows({ cancelled: [cancelLog] });

      expect(rows).toHaveLength(0);
    });

    /**
     * The chain does not agree with itself about hash case — an event carries
     * whatever the caller encoded, and the index lower-cases what it stores.
     * Matching them raw silently dropped every cancellation on one of the two
     * paths.
     */
    it("matches a cancellation to its validation regardless of case", () => {
      const rows = buildActivityRows({
        validated: [validatedLog(42n, 100n, HASH.toUpperCase().replace("0X", "0x"))],
        cancelled: [cancelLog],
      });

      expect(rows.find((r) => r.kind === "cancelled")?.tokenId).toBe(42n);
    });
  });

  describe("ordering", () => {
    it("puts the newest block first", () => {
      const rows = buildActivityRows({
        fulfilled: [saleLog(1n, 100n), saleLog(2n, 300n), saleLog(3n, 200n)],
      });

      expect(rows.map((r) => r.tokenId)).toEqual([2n, 3n, 1n]);
    });

    /** A listing and its sale can land in the same block; the later log wins. */
    it("breaks ties inside a block on log index", () => {
      const rows = buildActivityRows({
        fulfilled: [
          saleLog(1n, 100n, { logIndex: 2 }),
          saleLog(2n, 100n, { logIndex: 9 }),
          saleLog(3n, 100n, { logIndex: 5 }),
        ],
      });

      expect(rows.map((r) => r.tokenId)).toEqual([2n, 3n, 1n]);
    });
  });

  describe("missing streams", () => {
    /**
     * `undefined` is "could not be read", `[]` is "read, and empty". The
     * callers print "nothing has traded here yet" from an empty feed, which is
     * a claim about the chain — so it had better not be printed over a refusal.
     */
    it("treats an unread stream the same as an empty one for rows", () => {
      expect(buildActivityRows({})).toEqual([]);
      expect(buildActivityRows({ validated: [], fulfilled: [], cancelled: [] })).toEqual([]);
    });

    it("still builds what it can when one stream is missing", () => {
      const rows = buildActivityRows({
        validated: [validatedLog(1n, 100n)],
        cancelled: undefined,
      });

      expect(rows).toHaveLength(1);
    });
  });

  describe("the gate", () => {
    /**
     * `readFulfilment` refuses settlement currencies it does not recognise.
     * Sale history is a price signal, and an ungated feed lets a wash trade in
     * a token the attacker minted read as "last sale 1,000,000" to everyone
     * valuing the piece.
     */
    it("refuses a sale settled in an unrecognised token", () => {
      const rogue: ActivityLog = {
        args: {
          orderHash: HASH,
          offerer: SELLER,
          recipient: BUYER,
          offer: [
            { itemType: ItemType.ERC721, token: COLLECTION, identifier: 1n, amount: 1n },
          ],
          consideration: [
            {
              itemType: ItemType.ERC20,
              token: "0x9999999999999999999999999999999999999999",
              identifier: 0n,
              amount: parseEther("1000000"),
              recipient: SELLER,
            },
          ],
        },
        blockNumber: 100n,
        logIndex: 0,
      };

      expect(buildActivityRows({ fulfilled: [rogue] })).toEqual([]);
    });

    /** A collection-wide bid names no token, and is recorded against id 0. */
    it("records a collection offer against token zero", () => {
      const log: ActivityLog = {
        args: {
          orderHash: HASH,
          orderParameters: buildOffer({ bidder: BUYER, collection: COLLECTION, priceWei: TEN }),
        },
        blockNumber: 100n,
        logIndex: 0,
      };

      const rows = buildActivityRows({ validated: [log] });
      expect(rows[0]).toMatchObject({ kind: "offer", tokenId: 0n });
    });
  });
});

describe("a narrowed feed", () => {
  /**
   * The failure server-side filtering introduces, guarded.
   *
   * A cancellation used to find its token by looking through the validations
   * beside it. Narrow the query to one collection and those validations may be
   * thousands of rows outside the window — so the cancellation would quietly
   * disappear from its own collection's feed, which reads as "it was never
   * cancelled" rather than as a missing row.
   */
  it("names a cancellation with no validations in sight", () => {
    const rows = buildActivityRows({
      validated: [],
      cancelled: [
        {
          args: { orderHash: HASH, offerer: SELLER },
          blockNumber: 300n,
          logIndex: 1,
          collection: COLLECTION,
          tokenId: 42n,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "cancelled", tokenId: 42n, collection: COLLECTION });
  });

  /** The scanned path sets neither, and must keep working exactly as it did. */
  it("still falls back to looking when the source did not resolve it", () => {
    const rows = buildActivityRows({
      validated: [validatedLog(42n, 100n)],
      cancelled: [{ args: { orderHash: HASH, offerer: SELLER }, blockNumber: 300n, logIndex: 1 }],
    });

    expect(rows.find((r) => r.kind === "cancelled")?.tokenId).toBe(42n);
  });

  /** A resolved value wins, because the index looked it up against the order itself. */
  it("prefers what the source resolved over what it can infer", () => {
    const rows = buildActivityRows({
      validated: [validatedLog(1n, 100n)],
      cancelled: [
        {
          args: { orderHash: HASH, offerer: SELLER },
          blockNumber: 300n,
          logIndex: 1,
          collection: COLLECTION,
          tokenId: 99n,
        },
      ],
    });

    expect(rows.find((r) => r.kind === "cancelled")?.tokenId).toBe(99n);
  });
});
