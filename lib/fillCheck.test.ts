import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { classifyFillFailure, priceMoved } from "./fillCheck";

/**
 * This function decides whether a wallet opens.
 *
 * It fails in two directions and they are not symmetrical. Missing a real
 * "somebody bought it first" costs the person a wallet prompt and some gas to
 * learn what this could have told them free — annoying, recoverable. Matching
 * something that is NOT about the order refuses a buy that would have worked,
 * and tells someone their purchase is impossible when it is not. The second is
 * the one worth being strict about, which is why anything unrecognised returns
 * `undefined` and goes on to the wallet.
 */

describe("classifyFillFailure", () => {
  it("names a sale that happened first", () => {
    const block = classifyFillFailure(
      'The contract function "fulfillOrder" reverted. Error: OrderAlreadyFilled(bytes32 orderHash)',
    );

    expect(block?.kind).toBe("sold");
    expect(block?.say).toMatch(/bought this while you were looking/);
  });

  /** The only thing anybody reads in the moment is whether they have been charged. */
  it("says nothing was paid, on every block it reports", () => {
    const messages = [
      "OrderAlreadyFilled",
      "OrderIsCancelled",
      "InvalidSigner",
      "TokenTransferGenericFailure",
    ];

    for (const m of messages) {
      const block = classifyFillFailure(m);
      expect(block, m).toBeDefined();
      expect(block!.say, m).toMatch(/Nothing was sent|not paid any gas/);
    }
  });

  it("reads a withdrawn listing", () => {
    expect(classifyFillFailure("Error: OrderIsCancelled(bytes32)")?.kind).toBe("withdrawn");
  });

  it("reads a partly taken lot, and says to try for the rest", () => {
    const block = classifyFillFailure("OrderPartiallyFilled(bytes32 orderHash)");

    expect(block?.kind).toBe("part-taken");
    expect(block?.say).toMatch(/what is left/);
  });

  it("reads an expiry", () => {
    expect(classifyFillFailure("InvalidTime(uint256 startTime, uint256 endTime)")?.kind).toBe(
      "expired",
    );
  });

  /**
   * A counter increment voids everything a maker has standing without touching
   * any order's status — Seaport finds nothing validated under the new hash, and
   * with an empty signature that surfaces as a signer error. The person must not
   * be told anything about signatures; they did not sign anything.
   */
  it("reads a counter increment as the listing being gone, not as a signature problem", () => {
    const block = classifyFillFailure("Error: InvalidSigner()");

    expect(block?.kind).toBe("gone");
    expect(block?.say).not.toMatch(/signature|signer/i);
  });

  it("reads the seller having parted with the token", () => {
    const cases = [
      "TokenTransferGenericFailure(address token, address from, address to, uint256 identifier, uint256 amount)",
      "ERC721: transfer from incorrect owner",
      "ERC721: caller is not token owner or approved",
    ];

    for (const m of cases) {
      expect(classifyFillFailure(m)?.kind, m).toBe("moved");
    }
  });

  describe("what it must NOT block", () => {
    /**
     * Each of these would refuse a purchase the chain would have accepted, or
     * refuse one the person is entitled to decide about for themselves.
     */
    it("lets an unrecognised revert through to the wallet", () => {
      expect(classifyFillFailure("Error: SomethingNobodyHasSeenBefore()")).toBeUndefined();
    });

    it("lets a funds problem through, because the wallet judges it better", () => {
      expect(classifyFillFailure("insufficient funds for gas * price + value")).toBeUndefined();
    });

    it("lets a network problem through", () => {
      expect(classifyFillFailure("HTTP request failed. Status: 503")).toBeUndefined();
      expect(classifyFillFailure("The request took too long to respond.")).toBeUndefined();
    });

    it("lets a user rejection through", () => {
      expect(classifyFillFailure("User rejected the request.")).toBeUndefined();
    });

    it("says nothing about an empty message", () => {
      expect(classifyFillFailure("")).toBeUndefined();
    });
  });

  it("always asks for a refresh, because the page is still showing the dead listing", () => {
    expect(classifyFillFailure("OrderAlreadyFilled")?.refresh).toBe(true);
  });
});

describe("priceMoved", () => {
  const TEN = parseEther("10");

  it("says nothing when the price is unchanged", () => {
    expect(priceMoved(TEN, TEN)).toBeUndefined();
  });

  it("says nothing when there is no listing any more", () => {
    expect(priceMoved(TEN, undefined)).toBeUndefined();
  });

  it("names a re-listing above the price that was clicked", () => {
    expect(priceMoved(TEN, parseEther("14"))).toEqual({
      direction: "dearer",
      nowWei: parseEther("14"),
    });
  });

  it("names a re-listing below it", () => {
    expect(priceMoved(TEN, parseEther("6"))?.direction).toBe("cheaper");
  });

  /** One wei is a different order, and a different order is worth saying so. */
  it("notices a difference of one wei", () => {
    expect(priceMoved(TEN, TEN + 1n)?.direction).toBe("dearer");
  });
});
