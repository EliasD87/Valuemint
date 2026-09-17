import { describe, expect, it } from "vitest";
import { outcomeOf } from "./txOutcome";

/**
 * The bug this guards: `useWaitForTransactionReceipt().isSuccess` means "a
 * receipt was fetched", not "the transaction succeeded". viem resolves for a
 * reverted transaction, so every success banner in the app — "Bought.",
 * "Sold.", "Listed." — could sit above a transaction that did nothing.
 */
describe("outcomeOf", () => {
  it("is pending before a receipt arrives", () => {
    expect(outcomeOf(false, undefined)).toBe("pending");
    expect(outcomeOf(false, { status: "success" })).toBe("pending");
  });

  it("is pending when mined is true but no receipt is present yet", () => {
    expect(outcomeOf(true, undefined)).toBe("pending");
  });

  it("succeeds only on an explicit success status", () => {
    expect(outcomeOf(true, { status: "success" })).toBe("succeeded");
  });

  it("reports a mined-but-reverted transaction as reverted, not success", () => {
    expect(outcomeOf(true, { status: "reverted" })).toBe("reverted");
  });

  it("treats an absent or unrecognised status as reverted rather than success", () => {
    // Defaulting the other way is precisely the original defect.
    expect(outcomeOf(true, {})).toBe("reverted");
    expect(outcomeOf(true, { status: "weird" as "success" })).toBe("reverted");
  });
});
