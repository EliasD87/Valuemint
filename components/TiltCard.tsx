"use client";

import { useRef, type ReactNode } from "react";
import "./TiltCard.css";

/**
 * Tilts its contents toward a mouse pointer, with a sheen that follows it,
 * like the front card of the /trenches deck (owner, 2026-10-24: the depth
 * cards should be interactive too). Mouse only: touch and reduced motion get
 * the card still.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);

  const move = (e: React.PointerEvent) => {
    const el = inner.current;
    if (el === null || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 1) * 50).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((y + 1) * 50).toFixed(1)}%`);
    el.classList.add("is-tilting");
  };
  const leave = () => {
    const el = inner.current;
    if (el === null) return;
    for (const p of ["--rx", "--ry", "--gx", "--gy"]) el.style.removeProperty(p);
    el.classList.remove("is-tilting");
  };

  return (
    <div className={`tilt${className === undefined ? "" : ` ${className}`}`} onPointerMove={move} onPointerLeave={leave}>
      <div className="tilt-inner" ref={inner}>
        {children}
        <span className="tilt-sheen" aria-hidden="true" />
      </div>
    </div>
  );
}
