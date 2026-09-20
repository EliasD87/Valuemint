import { describe, expect, it, beforeEach } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { SEAPORT } from "@/config/seaport";
import { buildOffer, type OrderParameters } from "./seaport";
import {
  forgetSeenOrders,
  pendingOrdersSnapshot,
  rememberValidatedOrders,
} from "./pendingOrders";

/**
 * The order book is rebuilt from logs that are read six confirmations behind
 * the head and polled every thirty seconds, so an offer is absent from its own
 * maker's screen for the better part of a minute after they paid for it. This
 * module closes that gap by reading the order out of the receipt.
 *
 * It is tested rather than clicked because exercising it for real needs a
 * funded wallet placing a live offer, which this environment does not have —
 * and because the failure modes are quiet ones. An order held forever, an order
 * shown twice, or an order that skipped the safety whitelist all look fine on
 * screen.
 */

const BIDDER = "0x1111111111111111111111111111111111111111" as const;
const COLLECTION = "0x2222222222222222222222222222222222222222" as const;
const HASH = ("0x" + "ab".repeat(32)) as Hex;

const ORDER_VALIDATED = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

/** A receipt shaped like the one Seaport's `validate()` actually returns. */
function receiptFor(
  params: OrderParameters,
  { hash = HASH, from = SEAPORT }: { hash?: Hex; from?: string } = {},
): TransactionReceipt {
  /**
   * Both arguments are unindexed, so they live in `data` together — but
   * `topics[0]` still has to carry the event's selector, or a decoder cannot
   * know which event this is. Leaving it out is what a first version of this
   * fixture did, and every assertion failed against a module that was correct.
   */
  const data = encodeAbiParameters(ORDER_VALIDATED.inputs, [hash, params as never]);
  const topics = encodeEventTopics({ abi: [ORDER_VALIDATED] });

  return {
    blockNumber: 100n,
    logs: [{ address: from, data, topics }],
  } as unknown as TransactionReceipt;
}

/** Nothing here is reachable through the module's API, so rebuild state by hand. */
beforeEach(() => {
  forgetSeenOrders(pendingOrdersSnapshot().map((o) => o.hash));
});

describe("rememberValidatedOrders", () => {
  it("holds an order taken from the receipt that placed it", () => {
    const params = buildOffer({
      bidder: BIDDER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: 10n ** 18n,
    });

    rememberValidatedOrders(receiptFor(params));

    const held = pendingOrdersSnapshot();
    expect(held).toHaveLength(1);
    expect(held[0]!.hash).toBe(HASH);
    expect(held[0]!.blockNumber).toBe(100n);
    /** Decoded through `readOrder`, so it arrives as an order, not as bytes. */
    expect(held[0]!.read.kind).toBe("offer");
    expect(held[0]!.read.maker.toLowerCase()).toBe(BIDDER);
  });

  it("ignores logs from anywhere but Seaport", () => {
    const params = buildOffer({
      bidder: BIDDER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: 10n ** 18n,
    });

    /** A receipt also carries the collection's own Approval event. */
    rememberValidatedOrders(receiptFor(params, { from: COLLECTION }));

    expect(pendingOrdersSnapshot()).toHaveLength(0);
  });

  it("does nothing without a receipt", () => {
    rememberValidatedOrders(undefined);
    expect(pendingOrdersSnapshot()).toHaveLength(0);
  });

  it("keeps one entry per order however many times it is seen", () => {
    const params = buildOffer({
      bidder: BIDDER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: 10n ** 18n,
    });

    rememberValidatedOrders(receiptFor(params));
    rememberValidatedOrders(receiptFor(params));

    expect(pendingOrdersSnapshot()).toHaveLength(1);
  });
});

describe("forgetSeenOrders", () => {
  it("drops an order once the scan reports it", () => {
    const params = buildOffer({
      bidder: BIDDER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: 10n ** 18n,
    });
    rememberValidatedOrders(receiptFor(params));
    expect(pendingOrdersSnapshot()).toHaveLength(1);

    /** The scan reports hashes in whatever case the log had. */
    forgetSeenOrders([HASH.toUpperCase()]);

    expect(pendingOrdersSnapshot()).toHaveLength(0);
  });

  it("leaves orders the scan has not reported", () => {
    const params = buildOffer({
      bidder: BIDDER,
      collection: COLLECTION,
      tokenId: 1n,
      priceWei: 10n ** 18n,
    });
    rememberValidatedOrders(receiptFor(params));

    forgetSeenOrders([("0x" + "cd".repeat(32)) as Hex]);

    expect(pendingOrdersSnapshot()).toHaveLength(1);
  });
});
