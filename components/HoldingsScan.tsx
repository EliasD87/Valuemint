"use client";

/**
 * What a wallet scan is doing, while it is doing it.
 *
 * Looking a wallet up is slow in stages, and each stage used to look the same
 * — a grid of grey cards and nothing to say whether anything was happening.
 * It is three different waits, and each gets its own line:
 *
 *   1. Asking every collection on the chain for a balance. One multicall,
 *      but the collection list has to arrive first.
 *   2. Finding WHICH pieces. The balances say how many already, so this can
 *      count up against a real total — "Found 120 of 238" — and name the
 *      collections still being walked (a non-Enumerable one takes a
 *      Transfer-log scan and seconds).
 *   3. Reading each piece's details: name, artwork, traits.
 *
 * The cards arrive underneath as each stage lands, collection by collection,
 * rather than all at once at the end. This line goes away when there is
 * nothing left to wait for.
 *
 * The bar is decoration and says so (`aria-hidden`); the sentence is the
 * status, in a live region. Motion is transform-only and stops under
 * reduced motion — nothing here depends on an animation running.
 */
export function HoldingsScan({
  loading,
  discovering,
  collections,
  expected,
  found,
  detailed,
  pending,
}: {
  /** Anything at all still outstanding. */
  loading: boolean;
  /** Ids still being found (balances, enumeration, Transfer recovery). */
  discovering: boolean;
  /** Collections being checked. */
  collections: number;
  /** Pieces the chain says the wallet holds, found or not. */
  expected: number;
  /** Pieces identified so far. */
  found: number;
  /** Pieces whose details have loaded. */
  detailed: number;
  /** Collections still being walked for ids. */
  pending: readonly string[];
}) {
  if (!loading) return null;

  let text: React.ReactNode;
  let fraction: number | undefined;

  if (discovering && expected === 0) {
    text = (
      <>
        Scanning {collections > 0 ? <b>{collections}</b> : "every"} collection
        {collections === 1 ? "" : "s"} on ValueChain&hellip;
      </>
    );
  } else if (discovering) {
    fraction = expected > 0 ? found / expected : undefined;
    text = (
      <>
        Found <b>{found}</b> of <b>{expected}</b> pieces
        {pending.length > 0 ? <span className="hs-sub"> &middot; reading {pending.join(", ")}</span> : null}
      </>
    );
  } else {
    fraction = found > 0 ? detailed / found : undefined;
    text = (
      <>
        Loading details &middot; <b>{detailed}</b> of <b>{found}</b>
      </>
    );
  }

  return (
    <div className="hs">
      <span className="hs-radar" aria-hidden="true" />
      <div className="hs-body">
        <p className="hs-text" role="status" aria-live="polite">
          {text}
        </p>
        <span className="hs-track" aria-hidden="true">
          <span
            className={`hs-fill${fraction === undefined ? " is-indeterminate" : ""}`}
            style={fraction === undefined ? undefined : { transform: `scaleX(${Math.min(1, Math.max(0.04, fraction))})` }}
          />
        </span>
      </div>
    </div>
  );
}
