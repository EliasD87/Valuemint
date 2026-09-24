/**
 * The SOSO mark, for anywhere a figure is denominated in the chain's currency.
 *
 * Two drawings of the same hexagon, one per theme: a dark hexagon with a
 * white S on the light theme, a white hexagon with the S cut out on the dark
 * one. The hexagon is its own ground, so it needs no disc behind it — the old
 * mark was black-on-transparent and had to sit on a fixed white circle to be
 * seen at all on a dark card. Recolouring one file was never an option: it is
 * someone else's mark, and `filter: invert()` takes the orange face to cyan.
 *
 * Both are in the markup and CSS shows the one for the current theme. The
 * theme is an attribute on the root (`data-theme`), which a `<picture>`
 * media query cannot see; two tiny images, one hidden, can. They are ~3-4 KB
 * each and the browser caches both.
 *
 * Plain <img>s, not next/image, and deliberately.
 *
 * The assets are a few KB, served from our own origin at a fixed 128px, so the
 * optimiser has nothing to do — and `next/image` brought its own bug: even with
 * `unoptimized`, its lazy loader never fired for these. Measured on the market
 * page, every mark sat at `complete: false` with an empty `currentSrc` while a
 * direct fetch of the same path returned 200. A 16px icon has no business
 * behind an IntersectionObserver in the first place.
 */
export function SosoMark({ size = 18 }: { size?: number }) {
  return (
    <span className="soso-mark" style={{ ["--mark" as string]: `${size}px` }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img className="is-light" src="/soso-light.png" alt="" width={128} height={128} decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img className="is-dark" src="/soso-dark.png" alt="" width={128} height={128} decoding="async" />
    </span>
  );
}

/**
 * A price with its mark, which is what nearly every call site actually wants.
 *
 * `children` is the already-formatted figure, so this stays agnostic about
 * rounding — the pages disagree about that, and centralising it here would
 * change numbers as a side effect of adding an icon.
 */
export function Soso({
  children,
  unit = "SOSO",
  size,
}: {
  children: React.ReactNode;
  /** WSOSO wherever an offer is shown — the marketplace refuses native ones. */
  /**
   * Free text, not a closed union.
   *
   * It used to be `"SOSO" | "WSOSO"`, which is why every offer row carried the
   * literal `unit="WSOSO"` — the type made a hardcoded label the path of least
   * resistance, and that is precisely how a counterfeit token passed for the
   * real one (C1, 2026-09-16). The label is now derived from the order's own
   * currency by `currencyLabel`.
   */
  unit?: string;
  size?: number;
}) {
  /*
    "250 SOSO ⬡", everywhere: the figure first, then its unit, then the mark.

    The mark used to lead ("⬡ 250 SOSO"), with an opt-in `markAt="unit"`
    ("250 ⬡ SOSO") for a few call sites. It is one order now, the owner's
    choice. Name and mark still travel together, closer than the gap before
    them, so the pair reads as the currency and the number stands apart.
  */
  return (
    <span className="soso">
      <span className="soso-amount">{children}</span>
      <span className="soso-denom">
        <span className="soso-unit">{unit}</span>
        <SosoMark size={size} />
      </span>
    </span>
  );
}
