"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A small "i" that explains the figure beside it.
 *
 * Hover, keyboard focus, or a tap — a phone has no hover, and a `title`
 * attribute is all three of slow, unstyled and absent on touch, which is why
 * this is not one.
 *
 * **Portalled to the body and placed from the icon's own rectangle.** Rendered
 * in place, an absolutely positioned bubble is clipped by any ancestor with
 * `overflow: hidden` and centred on an icon near the edge of a phone screen it
 * hangs off it. Measured on open instead, and clamped a 16px gutter inside the
 * viewport, it always fits. It closes on scroll rather than following the page:
 * a fixed bubble left behind by a scroll would point at nothing.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => setMounted(true), []);

  const show = () => {
    const el = button.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 32);
    const left = Math.min(
      Math.max(16, r.left + r.width / 2 - width / 2),
      window.innerWidth - 16 - width,
    );
    setAt({ top: r.bottom + 8, left, width });
  };
  const hide = () => setAt(null);

  useEffect(() => {
    if (at === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [at]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="info-tip"
        aria-label={label}
        aria-describedby={at === null ? undefined : id}
        aria-expanded={at !== null}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (at === null ? show() : hide())}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="5" r="0.95" fill="currentColor" />
          <path d="M8 7.4v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {at !== null && mounted
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              className="info-tip-bubble"
              style={{ top: at.top, left: at.left, width: at.width }}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
