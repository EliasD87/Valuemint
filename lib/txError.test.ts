import { describe, expect, it } from "vitest";
import { explainTxError, isRejection } from "./txError";

/**
 * The two long strings below are the real errors this file was written for,
 * copied from production rather than invented. If a future edit stops matching
 * them, it has regressed the only two cases anybody actually hit.
 */
const RESOURCE_UNAVAILABLE =
  "Requested resource not available. Request Arguments: from: " +
  "0x0879A87D6D1Ea21C902946F2dAf80a7FAD77BC84 to: " +
  "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6 data: " +
  "0x51cff8d90000000000000000000000000879a87d6d1ea21c902";

const CHAIN_MISMATCH =
  "The current chain of the wallet (id: 31337) does not match the target chain " +
  "for the transaction (id: 286623 – undefined).";

describe("explainTxError", () => {
  it("names the network problem behind a chain mismatch", () => {
    const said = explainTxError(CHAIN_MISMATCH);
    expect(said).toMatch(/different network/i);
    expect(said).toMatch(/ValueChain/);
    // Neither chain id survives into what the person reads.
    expect(said).not.toMatch(/31337|286623/);
  });

  it("explains a node that has never heard of the contract", () => {
    const said = explainTxError(RESOURCE_UNAVAILABLE);
    expect(said).toMatch(/ValueChain/);
    // The calldata dump is the part that made this unreadable.
    expect(said).not.toMatch(/0x51cff8d9|Request Arguments/);
  });

  it("treats a cancellation as a decision, not a failure", () => {
    for (const m of [
      "User rejected the request.",
      "MetaMask Tx Signature: User denied transaction signature.",
    ]) {
      expect(explainTxError(m)).toBe("You cancelled that in your wallet.");
      expect(isRejection(m)).toBe(true);
    }
  });

  it("reads the contract's own errors back in plain words", () => {
    expect(explainTxError('reverted with custom error "NothingToWithdraw()"')).toMatch(
      /nothing to withdraw/i,
    );
    expect(explainTxError('reverted with custom error "MarketplaceNotApproved()"')).toMatch(
      /permission/i,
    );
    expect(explainTxError('reverted with custom error "OfferExpired()"')).toMatch(/expired/i);
    expect(explainTxError('reverted with custom error "MaxSupplyReached()"')).toMatch(/sold out/i);
  });

  it("does not mistake NoOffer for a word containing it", () => {
    expect(explainTxError('custom error "NoOffers()"')).not.toMatch(/no longer standing/);
  });

  it("falls back to the first line rather than inventing a message", () => {
    const said = explainTxError("Execution reverted for an unknown reason.\nRequest: …\nDetails: …");
    expect(said).toBe("Execution reverted for an unknown reason.");
  });

  it("truncates a long unrecognised message", () => {
    expect(explainTxError("x".repeat(500)).length).toBe(180);
    expect(explainTxError("x".repeat(500), 40).length).toBe(40);
  });

  it("says something rather than nothing for an empty error", () => {
    expect(explainTxError("")).toBe("That transaction failed.");
  });

  it("puts cancellation ahead of every other rule", () => {
    // A rejection whose text also mentions funds is still a rejection.
    expect(explainTxError("User rejected: insufficient funds warning shown")).toBe(
      "You cancelled that in your wallet.",
    );
  });
});

/**
 * Losing a race is the ordinary way a trade fails on a marketplace, and it used
 * to be unexplainable: the Seaport ABI carried no error entries, so viem could
 * not decode the revert and produced a message ending in a bare 4-byte
 * selector. `explainTxError` takes the first line, which threw the selector
 * away and left a sentence ending in a colon.
 */
describe("explainTxError - Seaport concurrency failures", () => {
  const viemShape = (name: string) =>
    `The contract function "fulfillOrder" reverted.

Error: ${name}(0xabc)

Contract Call:...`;

  it("explains losing a buy race", () => {
    const said = explainTxError(viemShape("OrderAlreadyFilled"));
    expect(said).toMatch(/somebody else bought this first/i);
    // And it says the money was not taken, which is the thing a person needs.
    expect(said).toMatch(/nothing was charged beyond gas/i);
  });

  it("explains an order cancelled underneath you", () => {
    expect(explainTxError(viemShape("OrderIsCancelled"))).toMatch(/cancelled it before/i);
  });

  it("explains a lot partly taken while confirming", () => {
    expect(explainTxError(viemShape("OrderPartiallyFilled"))).toMatch(/no longer available/i);
  });

  it("explains an order that expired mid-flight", () => {
    expect(explainTxError(viemShape("InvalidTime"))).toMatch(/expired/i);
  });

  it("explains a stale listing whose seller moved the token", () => {
    expect(explainTxError("execution reverted: TRANSFER_FROM_FAILED")).toMatch(/stale/i);
  });

  it("does not claim to understand an error it has no rule for", () => {
    const said = explainTxError(viemShape("SomeErrorNobodyHasSeen"));
    expect(said).not.toMatch(/somebody else bought/i);
    expect(said.length).toBeGreaterThan(0);
  });
});
