"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up to its value, and on to a new one when it changes.
 *
 * `pending` keeps it counting after it reaches the value — slowly, onward —
 * for a figure still being added to: "wallets involved" knows the traders at
 * once and the minters seconds later, and a number that sat still and then
 * jumped read as a mistake. When the real figure lands it counts on to that.
 *
 * Never the only way the number is shown: with reduced motion, in a tab that
 * is not visible, or if frames never come, it is simply the final figure.
 */
export function CountUp({
  value,
  decimals = 0,
  final,
  pending = false,
  duration = 1100,
}: {
  value: number;
  decimals?: number;
  /** The exact text to settle on, where the formatter's own rounding matters. */
  final?: string;
  pending?: boolean;
  duration?: number;
}) {
  const [shown, setShown] = useState<number>(() => (canAnimate() ? 0 : value));
  const [settled, setSettled] = useState(() => !canAnimate() && !pending);
  const current = useRef(shown);

  useEffect(() => {
    const show = (v: number) => {
      current.current = v;
      setShown(v);
    };

    if (!canAnimate()) {
      show(value);
      setSettled(!pending);
      return;
    }

    setSettled(false);
    const from = current.current;
    const start = performance.now();
    let last = start;
    let frame = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      if (p < 1) {
        show(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      } else if (pending) {
        /* Still being added to: keep going, about 6% of the figure a second. */
        show(Math.max(current.current, value) + Math.max(2, value * 0.06) * ((now - last) / 1000));
      } else {
        show(value);
        setSettled(true);
        return;
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    /* If frames stop coming — a tab sent to the background — land on it anyway. */
    const land = window.setTimeout(() => {
      if (pending) return;
      cancelAnimationFrame(frame);
      show(value);
      setSettled(true);
    }, duration + 400);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(land);
    };
  }, [value, pending, duration]);

  if (settled && final !== undefined) return <>{final}</>;
  return <>{decimals === 0 ? Math.floor(shown) : shown.toFixed(decimals)}</>;
}

function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  if (document.visibilityState === "hidden") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
