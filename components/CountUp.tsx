"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that shows its value, and counts on to a new one when it changes.
 *
 * It used to count up from zero on arrival, and keep creeping onward while
 * `pending` for a figure still being added to. Both made a page whose numbers
 * were already known look like it was still working them out — and since the
 * stats page renders on the server (2026-10-30), the numbers are known at
 * first paint. So a figure now starts at its value, and only a change seen
 * while the page is open animates, from the old number to the new.
 *
 * `pending` dims the figure instead: still true, visibly not final.
 *
 * Never the only way the number is shown: with reduced motion, in a tab that
 * is not visible, or if frames never come, it is simply the final figure.
 */
export function CountUp({
  value,
  decimals = 0,
  final,
  pending = false,
  duration = 700,
}: {
  value: number;
  decimals?: number;
  /** The exact text to settle on, where the formatter's own rounding matters. */
  final?: string;
  pending?: boolean;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const [settled, setSettled] = useState(true);
  const current = useRef(value);

  useEffect(() => {
    if (value === current.current) return;

    const show = (v: number) => {
      current.current = v;
      setShown(v);
    };

    if (!canAnimate()) {
      show(value);
      setSettled(true);
      return;
    }

    setSettled(false);
    const from = current.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      if (p < 1) {
        show(from + (value - from) * (1 - Math.pow(1 - p, 3)));
        frame = requestAnimationFrame(tick);
        return;
      }
      show(value);
      setSettled(true);
    };
    frame = requestAnimationFrame(tick);

    /* If frames stop coming — a tab sent to the background — land on it anyway. */
    const land = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      show(value);
      setSettled(true);
    }, duration + 400);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(land);
    };
  }, [value, duration]);

  const text = settled && final !== undefined ? final : decimals === 0 ? String(Math.floor(shown)) : shown.toFixed(decimals);
  return pending ? <span className="countup-pending">{text}</span> : <>{text}</>;
}

function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  if (document.visibilityState === "hidden") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
