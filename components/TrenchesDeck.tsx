"use client";

import { useEffect, useRef, useState } from "react";
import { TIERS, formatVolume } from "@/config/tiers";
import { TrenchesFrame } from "@/components/TrenchesFrame";
import "./TrenchesDeck.css";

/**
 * The /trenches hero's picture (owner, 2026-10-24: "use the pngs to come up
 * with some interactive idea"): the ten depths as a deck of Trenches cards.
 *
 *   - The front card tilts toward the pointer, with a sheen that follows it.
 *   - The next two depths peek out behind it.
 *   - A click on the card, a swipe, the arrows or the ten coloured dots deal
 *     another card.
 *   - It deals itself every few seconds until someone touches it, and pauses
 *     while the pointer is over it. With reduced motion it does neither: no
 *     tilt, no autoplay, cards just change.
 *   - With a wallet connected it opens on that wallet's depth.
 *
 * Every card is a TrenchesFrame, so the deck shows exactly the cards the depth
 * grid below shows.
 */

const AUTOPLAY_MS = 3600;
const n = TIERS.length;

export function TrenchesDeck({ start }: { start?: number }) {
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [hover, setHover] = useState(false);
  const [still, setStill] = useState(false);
  const front = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; id: number } | undefined>(undefined);

  /* Jump to the wallet's depth once it is known, unless someone is already flicking through. */
  useEffect(() => {
    if (start !== undefined && start >= 1 && start <= n && !touched) setIndex(start - 1);
  }, [start, touched]);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(q.matches);
    const on = () => setStill(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (touched || hover || still) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % n), AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [touched, hover, still]);

  const go = (to: number) => {
    setTouched(true);
    setIndex(((to % n) + n) % n);
  };

  /* The tilt and the sheen: the pointer's place over the front card as -1..1. */
  const tilt = (e: React.PointerEvent) => {
    const el = front.current;
    if (el === null || still || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.style.setProperty("--rx", `${(-y * 9).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 1) * 50).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((y + 1) * 50).toFixed(1)}%`);
  };
  const untilt = () => {
    const el = front.current;
    if (el === null) return;
    for (const p of ["--rx", "--ry", "--gx", "--gy"]) el.style.removeProperty(p);
  };

  const tier = TIERS[index]!;

  return (
    <div
      className={`tdeck${still ? " is-still" : ""}`}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        untilt();
      }}
    >
      <div
        className="tdeck-stage"
        role="group"
        aria-roledescription="carousel"
        aria-label="The ten Trenches depths"
        onPointerMove={tilt}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") drag.current = { x: e.clientX, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = undefined;
          if (d === undefined || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 36) go(index + (dx < 0 ? 1 : -1));
          else go(index + 1);
        }}
        onClick={(e) => {
          // Mouse clicks only: touch is handled on pointer up, as a tap or a swipe.
          if ((e.nativeEvent as PointerEvent).pointerType === "mouse" || e.detail === 0) go(index + 1);
        }}
      >
        {TIERS.map((t, i) => {
          /* 0 is the front, 1 and 2 peek behind, the rest wait out of sight. */
          const pos = (i - index + n) % n;
          const back = pos === n - 1;
          return (
            <div
              key={t.n}
              ref={pos === 0 ? front : undefined}
              className={`tdeck-card is-pos-${pos > 2 ? (back ? "gone" : "hidden") : pos}`}
              aria-hidden={pos !== 0}
            >
              <TrenchesFrame tier={t} meta={<b>{t.min === 0 ? "Any trade" : `${formatVolume(t.min)} volume`}</b>} />
              {pos === 0 ? <span className="tdeck-sheen" aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>

      <div className="tdeck-nav">
        <button type="button" className="tdeck-arrow" aria-label="Previous depth" onClick={() => go(index - 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <div className="tdeck-dots" role="tablist" aria-label="Choose a depth">
          {TIERS.map((t, i) => (
            <button
              key={t.n}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${t.name}, depth ${t.n}`}
              className={`tdeck-dot${i === index ? " is-on" : ""}`}
              style={{ ["--c" as string]: t.colour }}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button type="button" className="tdeck-arrow" aria-label="Next depth" onClick={() => go(index + 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
      <p className="tdeck-caption" aria-live="polite">
        Depth {tier.n} of {n} · <b>{tier.name}</b>
      </p>
    </div>
  );
}
