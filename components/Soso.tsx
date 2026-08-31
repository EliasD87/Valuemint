/**
 * The SOSO mark, for anywhere a figure is denominated in the chain's currency.
 *
 * The asset is SoSoValue's own logo, black-on-transparent. That matters: drawn
 * bare it is invisible on a dark surface, and every price on this site appears
 * on `--surface`, which is near-black in the dark theme. Recolouring is not an
 * option either — it is someone else's mark, and `filter: invert()` would take
 * the orange face to cyan.
 *
 * So it sits on a fixed light disc, the way an exchange draws a token icon. The
 * disc is stated in absolute colour rather than a token, deliberately: it is
 * the mark's own ground, not part of our palette, and it must not flip with the
 * theme. A faint ring keeps it from dissolving into a white card in light mode.
 *
 * A plain <img>, not next/image, and deliberately.
 *
 * The asset is 3 KB, served from our own origin at a fixed 96px, so the
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
      <img src="/soso.png" alt="" width={96} height={96} decoding="async" />
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
  unit?: "SOSO" | "WSOSO";
  size?: number;
}) {
  return (
    <span className="soso">
      <SosoMark size={size} />
      <span className="soso-amount">{children}</span>
      <span className="soso-unit">{unit}</span>
    </span>
  );
}
