import { describe, expect, it } from "vitest";
import { decideDocument, documentAnswer } from "./documentCache";

/**
 * These two rules broke the live site, so they are asserted rather than
 * commented.
 *
 * Both failures were silent. A Treasure Box card rendered with no name and no
 * picture; nothing threw, nothing logged, and the page looked like it was still
 * loading. The only signal was somebody looking at it.
 */

const readable = { name: "SoDEXTreasureBox", image: "ipfs://x" };

describe("decideDocument — the body decides, not the status", () => {
  /**
   * The exact failure. SoDEX answers 501 and sends a good document anyway, and
   * it does not do so consistently: 107 of 109 cached documents had been filed
   * as unfetchable while the same URLs returned 2xx minutes earlier.
   */
  it("keeps a good document that arrived with a 501", () => {
    const d = decideDocument({ allowed: true, ok: false, status: 501, body: readable, readable: true });

    expect(d.status).toBe("ok");
    expect(d.raw).toBe(readable);
  });

  it("keeps one that arrived with a 200", () => {
    expect(
      decideDocument({ allowed: true, ok: true, status: 200, body: readable, readable: true }).status,
    ).toBe("ok");
  });

  it("keeps one behind any other unhappy status", () => {
    for (const status of [500, 502, 503, 418]) {
      const d = decideDocument({ allowed: true, ok: false, status, body: readable, readable: true });
      expect(d.status, `status ${status}`).toBe("ok");
    }
  });

  /** A 404 is a definite answer about the URL, whatever else came with it. */
  it("treats a 404 as nothing there", () => {
    expect(decideDocument({ allowed: true, ok: false, status: 404, readable: false }).status).toBe(
      "missing",
    );
  });

  describe("when there is no JSON", () => {
    it("calls a good status nothing there", () => {
      expect(decideDocument({ allowed: true, ok: true, status: 200, readable: false }).status).toBe(
        "missing",
      );
    });

    /** A bad status with no body is the one case where the status is all there is. */
    it("calls a bad status try-again", () => {
      expect(decideDocument({ allowed: true, ok: false, status: 502, readable: false }).status).toBe(
        "refused",
      );
    });

    it("calls a request that never completed try-again", () => {
      expect(decideDocument({ allowed: true, readable: false }).status).toBe("refused");
    });
  });

  it("calls JSON that is not metadata nothing there", () => {
    const d = decideDocument({ allowed: true, ok: true, status: 200, body: { a: 1 }, readable: false });

    expect(d.status).toBe("missing");
  });

  /**
   * These URLs come from `tokenURI` on a caller-named contract, so the
   * allowlist decides before anything else does.
   */
  it("refuses a host the server may not call, whatever it would have said", () => {
    const d = decideDocument({ allowed: false, ok: true, status: 200, body: readable, readable: true });

    expect(d.status).toBe("refused");
    expect(d.raw).toBeNull();
  });

  /** Some hosts genuinely answer `null`, which is not the same as sending nothing. */
  it("tells a null body apart from no body", () => {
    expect(decideDocument({ allowed: true, ok: true, status: 200, body: null, readable: false }).status)
      .toBe("missing");
  });
});

describe("documentAnswer — 'could not read' is not 'nothing there'", () => {
  /**
   * The bug that made a slow path a broken one. `refused` was answered as
   * `null`, callers read `null` as final, and the card gave up instead of
   * fetching the document itself — so the fallback built for exactly this
   * could not fire.
   */
  it("omits a refusal so the caller reads it itself", () => {
    expect(documentAnswer({ status: "refused", raw: null })).toEqual({ omit: true });
  });

  it("never answers null for a refusal", () => {
    const answer = documentAnswer({ status: "refused", raw: null });

    expect(answer.omit).toBe(true);
    expect("value" in answer).toBe(false);
  });

  it("answers null only when there is genuinely nothing there", () => {
    expect(documentAnswer({ status: "missing", raw: null })).toEqual({ omit: false, value: null });
  });

  it("answers the document when it has one", () => {
    expect(documentAnswer({ status: "ok", raw: readable })).toEqual({
      omit: false,
      value: readable,
    });
  });

  /** The round trip the live failure took, end to end. */
  it("serves a 501-with-a-document rather than blanking the card", () => {
    const decided = decideDocument({
      allowed: true,
      ok: false,
      status: 501,
      body: readable,
      readable: true,
    });

    expect(documentAnswer(decided)).toEqual({ omit: false, value: readable });
  });
});
