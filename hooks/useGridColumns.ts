"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/**
 * How many columns a CSS grid is drawing right now.
 *
 * This exists so "show one row" can mean one row. The alternative was a
 * breakpoint table in JavaScript mirroring the one in the stylesheet, which is
 * two descriptions of the same layout that drift apart the first time either is
 * touched — and the number matters twice over, because it decides how many
 * cards are shown AND is the difference between a row that is short and one
 * that spills onto a second.
 *
 * `grid-template-columns` is resolved by the browser to the actual tracks, so
 * `repeat(auto-fill, minmax(min(15rem, 100%), 1fr))` comes back as
 * `"236px 236px 236px"` and counting is the whole calculation. `auto-fill`
 * rather than `auto-fit` is what makes that work while the grid is empty:
 * `auto-fit` collapses tracks with nothing in them, so the count would be zero
 * exactly when it is first needed.
 */
export function useGridColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(0);

  const read = useCallback(() => {
    const el = ref.current;
    if (el === null) return;

    const tracks = window.getComputedStyle(el).gridTemplateColumns;
    /** `none` until the element has been laid out at least once. */
    const n = tracks === "none" ? 0 : tracks.split(" ").filter((t) => t !== "").length;
    /** Only on a real change, or this effect re-triggers itself forever. */
    setColumns((was) => (was === n ? was : n));
  }, [ref]);

  /**
   * On every commit, in a layout effect, and that is the path that matters.
   *
   * `getComputedStyle` needs layout, which always happens, rather than the
   * rendering step, which does not — so unlike every observer below it, this
   * one cannot silently not run. It is also why it is a LAYOUT effect: it lands
   * before paint, so a grid about to collapse to one row is never drawn at full
   * height and then cut down.
   *
   * No dependency array on purpose. Anything that re-renders the grid — cards
   * arriving, a listing landing, the row being expanded — re-checks the count
   * for free, and `setColumns` above makes a no-op of the usual case.
   */
  useLayoutEffect(read);

  /**
   * And a ResizeObserver, for the one case a commit does not cover: the window
   * being dragged wider while nothing else about the page changes.
   *
   * It is the addition, not the foundation, because it is not dependable.
   * Measured in this project's own preview pane, where `visibilityState` is
   * permanently `hidden` because our `frame-ancestors 'none'` header stops the
   * pane compositing: `ResizeObserver` never delivered — not even the callback
   * `observe()` is specified to make immediately — and neither did the `resize`
   * event, `requestAnimationFrame`, or `MutationObserver`. Everything tied to
   * the rendering step is dead there; only timers and layout survived. A real
   * visible tab has all of them, and a hidden one that becomes visible again
   * delivers what it queued, so this is a fallback rather than a fault — but it
   * is the reason the measurement above does not rest on it.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, read]);

  return columns;
}
