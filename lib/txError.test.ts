import { describe, expect, it } from "vitest";
import { explainTxError, isRateLimited, isRejection } from "./txError";

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

  it("explains a reused nonce as the wallet catching up, not a contract failure", () => {
    const raw =
      'The contract function "mint" reverted with the following reason: RPC 0x45f9f Custom ' +
      "eth_sendRawTransaction: nonce too low: next nonce 517, tx nonce 516";
    expect(explainTxError(raw)).toContain("Wait a few seconds and try again");
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

describe("a node over its limit (-32005)", () => {
  it("says nothing was sent and to try again, rather than the raw node text", () => {
    const said = explainTxError("Request exceeds defined limit.");
    expect(said).toMatch(/Nothing was sent/);
    expect(said).not.toMatch(/defined limit/);
  });

  it("recognises the 429 wording rpc.valuechain.xyz actually sends, and names the steadier server", () => {
    const raw = 'HTTP request failed. Status: 429 {"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"rate-limit exceeded"}}';
    expect(isRateLimited(raw)).toBe(true);
    expect(explainTxError(raw)).toMatch(/mainnet.valuechain.xyz/);
  });

  it("does not treat a reverted purchase or a cancelled one as a busy network", () => {
    expect(isRateLimited("execution reverted: InvalidTime")).toBe(false);
    expect(isRateLimited("User rejected the request.")).toBe(false);
  });

  /**
   * The shape viem actually throws from a write: the short message, then the
   * whole call — calldata, addresses, arguments. Every number in an order ends
   * up in here, so "429" appears by chance; only the status may count.
   */
  const viemWrite = (first: string, calldata: string, args: string) =>
    `${first}

Request Arguments:
  from:   0x0879A87D6D1Ea21C902946F2dAf80a7FAD77BC84
  to:     0x0000000000000068F116a894984e2DB1123eB395
  value:  5 SOSO
  data:   ${calldata}

Contract Call:
  address:   0x0000000000000068F116a894984e2DB1123eB395
  function:  fulfillOrder((address,address,(uint8,address,uint256,uint256,uint256)[]), bytes32)
  args:      (${args})

Version: viem@2.21.0`;
  const CALLDATA_WITH_429 = "0xb3a34c4c0000000000000000000000000000000000000000000000000000000000000040429a7f13";

  it("recognises a bare HTTP 429 from the server, with no other wording", () => {
    const raw = "HTTP request failed.\n\nStatus: 429\nURL: https://rpc.valuechain.xyz\n\nVersion: viem@2.21.0";
    expect(isRateLimited(raw)).toBe(true);
    expect(isRateLimited('{"status":429,"message":"slow down"}')).toBe(true);
  });

  it("recognises a wallet relaying -32005 inside its own error", () => {
    expect(isRateLimited('Internal JSON-RPC error.\n{"code":-32005,"message":"Request exceeds defined limit"}')).toBe(true);
  });

  it("does not call a lost race busy because 429 appears in the calldata or the token id", () => {
    const raw = viemWrite(
      'The contract function "fulfillOrder" reverted.\n\nError: OrderAlreadyFilled(0x9f2c)',
      CALLDATA_WITH_429,
      "{identifierOrCriteria: 429n, startAmount: 1n}, 0x0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(isRateLimited(raw)).toBe(false);
    expect(explainTxError(raw)).toMatch(/somebody else bought this first/i);
  });

  it("never resends after a Reject, whatever else the error says", () => {
    const raw = viemWrite(
      "User rejected the request.\n\nDetails: MetaMask Tx Signature: User denied transaction signature.",
      CALLDATA_WITH_429,
      "{identifierOrCriteria: 429n}",
    );
    expect(isRateLimited(raw)).toBe(false);
    // Even a rejection that mentions a limit is still a rejection.
    expect(isRateLimited("User rejected the request. (rate limit warning shown)")).toBe(false);
  });

  it("does not mistake -32005 inside a longer number for the code", () => {
    expect(isRateLimited("value: 1-320050")).toBe(false);
    expect(isRateLimited("salt: 99-32005")).toBe(false);
  });
});
