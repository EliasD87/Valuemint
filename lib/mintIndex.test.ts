import { describe, expect, it } from "vitest";
import { mintIndexState } from "./mintIndex";

/**
 * The page this governs said "Nothing is minting at the moment." while it was
 * still reading the chain, and there were five collections open at the time.
 *
 * It is tested rather than clicked because the failing frame is the hard one to
 * catch: locally the reads land in under a second, so the wrong state flashes
 * past faster than it can be sampled, and it is exactly the visitor on a slow
 * answer who sees it and leaves. The rule is small enough to state completely.
 */

const settled = { listLoading: false, statePending: false, known: 6, open: 0 };

describe("mintIndexState", () => {
  it("shows the list whenever anything is open", () => {
    expect(mintIndexState({ ...settled, open: 5 })).toBe("list");
  });

  it("says nothing is minting only once everything has been read", () => {
    expect(mintIndexState(settled)).toBe("empty");
  });

  it("waits while no collection is known yet", () => {
    expect(
      mintIndexState({ listLoading: true, statePending: true, known: 0, open: 0 }),
    ).toBe("settling");
  });

  it("waits while collections are known but their state is not", () => {
    /**
     * The reported bug. `known.ts` needs no network, so the list can be in hand
     * within a frame while `publicMintEnabled` is unknown for every row — and
     * the old page called that "nothing is minting".
     */
    expect(
      mintIndexState({ listLoading: false, statePending: true, known: 6, open: 0 }),
    ).toBe("settling");
  });

  it("does not wait forever on a chain with no collections at all", () => {
    /**
     * `statePending` cannot clear if the multicall was never issued, which is
     * what happens when there is nothing to read. Waiting on `known > 0` is
     * what stops that becoming permanent skeletons.
     */
    expect(
      mintIndexState({ listLoading: false, statePending: true, known: 0, open: 0 }),
    ).toBe("empty");
  });

  it("never falls back to skeletons over collections already on screen", () => {
    /**
     * Growing the list re-keys the multicall, so `statePending` goes true again
     * with cards already rendered. Replacing them with skeletons would be a
     * flash backwards; the open ones stay.
     */
    expect(
      mintIndexState({ listLoading: false, statePending: true, known: 9, open: 5 }),
    ).toBe("list");
    expect(
      mintIndexState({ listLoading: true, statePending: true, known: 9, open: 5 }),
    ).toBe("list");
  });
});
