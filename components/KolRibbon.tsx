"use client";

import { useEffect, useRef } from "react";
import { KOLS, kolLocal, type Kol } from "@/config/kols";
import { buildWave, magAt, screenAt, stepOf, yawAt, type Wave } from "@/lib/ribbon";
import "./KolRibbon.css";

/**
 * The KOL portraits on a corrugated belt.
 *
 * A single row of cards on a surface that undulates towards and away from the
 * camera. The card on a crest is near the lens and faces you square on; the one
 * in a trough is far away and small; the ones on the slopes between are turned
 * almost edge-on. The belt slides along that fixed shape forever, so a card
 * grows, turns to face you, and shrinks away again as it passes — and the row's
 * silhouette bulges and pinches without anything being animated directly.
 *
 * Why it is built this way rather than as a flat carousel with `scale()`: the
 * turn is the whole effect. A card on the slope is a trapezoid — its far edge
 * is genuinely further from the eye than its near edge — and no combination of
 * `scaleX` and `skew` produces that. A `perspective()` and a `rotateY` do.
 *
 * ## The shape
 *
 * One parameter `u` runs down the belt, and three things are read off it:
 *
 *     scale(u) = EYE / (EYE − AMP · cos u)    near at a crest, far at a trough
 *     yaw(u)   = YAW · sin u                  flat at both, turned between
 *     X(u)                                    where on the screen it lands
 *
 * The first is what perspective would do to something moving towards and away
 * from the lens, so the sizes run the way a real sheet's would: a crest card
 * 2.8× and a trough card 0.6×, rather than symmetrically either side of one.
 *
 * ## Two wrong turns, both worth recording
 *
 * The first build was a literal sheet, `z = AMP · cos(2πx / λ)`, with each card
 * laid tangent to it and one `perspective` on the frame. It gapped badly: a
 * rigid card can only follow a curve whose radius is large next to the card
 * itself, and a sheet deep enough to be dramatic is far tighter than that — at
 * this depth the radius at a trough came out at 102 units against a card 250
 * wide, the curve doubling back inside a single card, so consecutive cards
 * splayed apart and left black wedges through the row. A sheet gentle enough to
 * avoid that runs about 33 card-widths to a wave, which puts a third of one
 * wave on a wide screen: no bulge, no pinch, no effect.
 *
 * The second kept one `perspective` on the frame and spaced the cards by the
 * width they cover in *world* x. That fails for a subtler reason: a shared
 * vanishing point multiplies a card's x by `EYE / (EYE − z)`, so two cards a
 * fixed distance apart land at `x·m₁` and `x·m₂`, and once `x` is a few hundred
 * the `x·Δm` between them swamps the spacing. Measured, the row came apart —
 * cards projected past one another and the order on screen stopped matching the
 * order along the belt.
 *
 * ## What it does instead
 *
 * Each card carries its **own** perspective, and the frame has none:
 *
 *     translate3d(X, 0, 0) scale(m) perspective(P) rotateY(yaw)
 *
 * The keystone then happens about the card's own centre, so a card's projected
 * width depends only on its yaw and not on where it is — which is what makes
 * the packing solvable in closed form. Rotating a card of side `W` by θ under a
 * local perspective `P` puts its edges at ±(W/2)·sin θ in depth, so the width
 * it covers is
 *
 *     w(θ) = W · cos θ · P² / (P² − ((W/2)·sin θ)²)
 *
 * and the belt is spaced by exactly that, magnified:
 *
 *     dX/du = (w(yaw(u)) / step) · scale(u)
 *
 * Over the `step` of parameter between two cards, the screen advances by
 * exactly the width the turned, scaled card covers on it. Cards meet edge to
 * edge everywhere on the wave, and `X` rises strictly, so the row can never
 * fold through itself. There is no closed form for the integral, so `build`
 * walks one wave once and keeps a lookup table; `screenForPhase` reads it back.
 *
 * The one thing the frame's perspective was doing for free was sorting the
 * overlap by depth. Without it, `place` writes a `z-index` from the scale, so
 * the card on the crest still covers its neighbours rather than being covered
 * by whichever of them happens to come later in the markup.
 *
 * ## The belt
 *
 * `SLOTS` cards, each permanently holding one portrait, wrapped into a closed
 * ring. That is the reason a slot's `src` is written once and never again: the
 * belt is a ring, so no card ever needs to change what it shows, and the render
 * loop only ever writes transforms.
 *
 * The ring closes cleanly because `SLOTS` is a whole number of waves — x is a
 * periodic function plus a straight ramp, so wrapping by a whole number of
 * periods moves a card by exactly the belt's length and nothing else.
 */

/**
 * Cards per wave, crest to crest. Both must divide `SLOTS`.
 *
 * Shorter waves on a narrow screen. A phone cannot have both — a card big
 * enough to be worth looking at and a wave long enough to hold eight of them —
 * and at eight it showed three cards, one of them filling most of the screen,
 * which is a picture of a card rather than a row. Six packs a crest, a pinch
 * and the start of the next crest across a phone.
 */
const WIDE_PER_WAVE = 8;
const NARROW_PER_WAVE = 6;
/** Frame width below which the belt switches to the shorter wave. */
const NARROW_AT = 700;

/**
 * Card slots: a multiple of the roster, so the same portrait never lands twice
 * in view, and a multiple of both wave lengths, so the ring closes on a whole
 * wave either way.
 *
 * Six waves at the long setting, against the one and a half that fit on a wide
 * screen — the wrap-around, where a card teleports the length of the belt,
 * stays well outside the frame at every viewport this renders at.
 */
const SLOTS = KOLS.length * 4;

/**
 * The belt's fixed running order.
 *
 * Stride 5 rather than `i % 12`, which would run the roster in its stored order
 * four times over and put the two cats a fixed twelve apart. Five is coprime
 * with twelve, so every portrait still appears exactly four times and the order
 * is mixed. It is arithmetic rather than a shuffle because the server and the
 * browser have to agree on it, and it is computed once because it never
 * changes.
 */
const BELT: Kol[] = Array.from({ length: SLOTS }, (_, i) => KOLS[(i * 5) % KOLS.length]).filter(
  (k): k is Kol => k !== undefined,
);

/**
 * The geometry, in the units of a 1440 x 560 frame. Everything here is
 * multiplied by one scale factor at measure time, `perspective` included, so a
 * narrow screen gets a smaller copy of the same picture rather than a different
 * one: scaling the scene but not the eye distance would flatten the wave.
 */
const DESIGN_W = 1440;
const DESIGN_H = 560;
/** Card side. The portraits are square and framed — they are never cropped. */
const CARD = 140;
/** How far the wave carries a card towards the camera, and away from it. */
const AMP = 900;
/** Yaw at the steepest point, in radians. 1.3 is a little under 75°. */
const YAW = 1.3;
/** Eye distance. Must stay well clear of AMP or a crest lands on the lens. */
const EYE = 1400;
/**
 * Each card's own perspective, in card widths. Lower keystones harder: at 1.6
 * a fully turned card's near edge is drawn about 1.9× its far edge, which is
 * the slant that makes the row read as turning rather than squashing.
 */
const KEYSTONE = 1.6;

/**
 * Floor and ceiling on the scale.
 *
 * The floor applies to the **width** term only, and that separation matters. A
 * phone is a quarter of the design's width, and scaling everything by a quarter
 * left a 165px belt adrift in a 471px band — technically the same picture, and
 * nothing to look at. The floor keeps the cards worth seeing there and costs a
 * little of the wave: about one crest across a phone rather than one and a
 * half.
 *
 * The height term is never floored, because a short window is the one case
 * where too large a card does not fit and would be clipped by the frame.
 */
const MIN_K = 0.5;
const MAX_K = 1.25;

/** Samples per wave in the x lookup table. */
const TABLE = 1024;

/**
 * Cards per second at rest.
 *
 * One, down from 1.6. On a wide screen a card covers about 82px of the row, so
 * the belt runs at roughly 82px/s and takes some seventeen seconds to carry a
 * portrait across a 1440 frame — against eleven before. The page is a thing to
 * look at rather than a thing to keep up with, and at the old pace a crest
 * passed before you had finished reading the face on it.
 *
 * A push still moves it as fast as ever: this is only the speed it returns to.
 */
const DRIFT = 1.0;
/** Wheel delta to belt speed. One notch of a mouse wheel is about 100. */
const WHEEL_GAIN = 5;
/** Page-scroll pixels to belt speed, for the scrollbar and for touch. */
const SCROLL_GAIN = 8;
/** Ceiling on a push, in belt pixels per second. */
const MAX_V = 2600;
/** Seconds for a push to fall to 1/e. */
const EASE = 0.42;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function KolRibbon() {
  const frameRef = useRef<HTMLDivElement>(null);
  const beltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const belt = beltRef.current;
    if (frame === null || belt === null) return;

    const cards = Array.from(belt.children) as HTMLElement[];
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    /**
     * The wave this frame is drawing, its lookup table and the parameter
     * between one card and the next — all replaced whenever `measure` runs.
     */
    let wave: Wave = {
      card: CARD,
      amp: AMP,
      eye: EYE,
      yaw: YAW,
      keystone: KEYSTONE,
      perWave: WIDE_PER_WAVE,
    };
    let table = buildWave(wave, TABLE);
    let step = stepOf(wave);
    /** Screen pixels per radian of `u`, for turning a gesture into a push. */
    let pxPerPhase = table.perWaveX / (2 * Math.PI);

    const measure = () => {
      /**
       * The frame's own box, never `window.innerWidth` — which reads 0 in a
       * hidden preview pane, and would take every card with it.
       */
      const w = frame.clientWidth || document.documentElement.clientWidth || DESIGN_W;
      const h = frame.clientHeight || DESIGN_H;
      const k = Math.min(Math.max(w / DESIGN_W, MIN_K), h / DESIGN_H, MAX_K);

      wave = {
        card: CARD * k,
        amp: AMP * k,
        eye: EYE * k,
        yaw: YAW,
        keystone: KEYSTONE,
        perWave: w < NARROW_AT ? NARROW_PER_WAVE : WIDE_PER_WAVE,
      };
      table = buildWave(wave, TABLE);
      step = stepOf(wave);
      pxPerPhase = table.perWaveX / (2 * Math.PI);

      frame.style.setProperty("--kr-card", `${wave.card}px`);
    };

    /** How far the belt has run, in radians of `u`. */
    let phase = 0;

    const place = () => {
      const ring = SLOTS * step;
      const half = ring / 2;

      for (let i = 0; i < cards.length; i++) {
        const el = cards[i];
        if (el === undefined) continue;

        // Wrapped into the half-belt either side of centre, so the join happens
        // off screen rather than in front of anyone.
        const u = ((((i * step - phase + half) % ring) + ring) % ring) - half;

        const m = magAt(wave, u);

        el.style.transform =
          `translate3d(${screenAt(table, u).toFixed(2)}px, 0, 0) scale(${m.toFixed(4)}) ` +
          `perspective(${(KEYSTONE * wave.card).toFixed(1)}px) ` +
          `rotateY(${yawAt(wave, u).toFixed(4)}rad)`;
        // Near covers far. Without the frame's perspective nothing else sorts
        // these, and markup order would put the crest card behind its
        // neighbours as often as in front.
        el.style.zIndex = `${Math.round(m * 1000)}`;
      }
    };

    /** Velocity from a push, in belt pixels per second. Decays; zero at rest. */
    let boost = 0;
    let dragging = false;
    let grabX = 0;
    let grabAt = 0;
    let last = 0;
    let raf = 0;

    const tick = (now: number) => {
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!dragging) {
        const drift = still.matches ? 0 : step * DRIFT;
        phase += (drift + boost / pxPerPhase) * dt;
        boost *= Math.exp(-dt / EASE);
        if (Math.abs(boost) < 0.5) boost = 0;
      }

      place();
      raf = requestAnimationFrame(tick);
    };

    const push = (v: number) => {
      boost = clamp(boost + v, -MAX_V, MAX_V);
    };

    /**
     * The wheel is read but never swallowed — the listener is passive and does
     * not call `preventDefault`, so the page still scrolls to the footer while
     * the belt takes the same gesture. Trapping the wheel on a page with
     * something below it is a scroll-jack, and this is a showcase, not a trap.
     */
    let wheelAt = -1e9;
    const onWheel = (e: WheelEvent) => {
      wheelAt = e.timeStamp;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      push(d * WHEEL_GAIN);
    };

    /**
     * And the page's own scroll, which is what a dragged scrollbar and a touch
     * flick produce. Skipped just after a wheel event, or a trackpad would be
     * counted twice — once as the wheel and again as the scroll it caused.
     */
    let scrolled = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const d = y - scrolled;
      scrolled = y;
      if (performance.now() - wheelAt < 160) return;
      push(d * SCROLL_GAIN);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      grabX = e.clientX;
      grabAt = performance.now();
      boost = 0;
      frame.setPointerCapture(e.pointerId);
      frame.classList.add("is-held");
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - grabX;
      grabX = e.clientX;
      phase -= dx / pxPerPhase;

      // Carry the hand's speed into the release, so letting go flings.
      const now = performance.now();
      const dt = (now - grabAt) / 1000;
      if (dt > 0.004) {
        boost = clamp(-dx / dt, -MAX_V, MAX_V);
        grabAt = now;
      }
      place();
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId);
      frame.classList.remove("is-held");
    };

    const resize = new ResizeObserver(() => {
      measure();
      place();
    });

    measure();
    place();
    resize.observe(frame);

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    frame.addEventListener("pointerdown", onDown);
    frame.addEventListener("pointermove", onMove);
    frame.addEventListener("pointerup", onUp);
    frame.addEventListener("pointercancel", onUp);

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      frame.removeEventListener("pointerdown", onDown);
      frame.removeEventListener("pointermove", onMove);
      frame.removeEventListener("pointerup", onUp);
      frame.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div
      className="kr"
      ref={frameRef}
      /*
        One announcement for the whole belt. Naming forty-eight cards that are
        twelve portraits shown four times would be a stutter, and none of them
        is something to act on.
      */
      role="img"
      aria-label="Portraits of the SoDEX regulars"
    >
      <div className="kr-belt" ref={beltRef}>
        {BELT.map((kol, i) => (
          <div className="kr-card" key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Forty-eight
                slots over twelve fixed-size local WebPs, every one of them on
                screen at first paint. `next/image` would add a srcset for widths
                that never occur and an optimiser hop for bytes that are already
                640px WebP. */}
            <img
              src={kolLocal(kol)}
              alt=""
              width={640}
              height={640}
              draggable={false}
              decoding="async"
              loading="eager"
              fetchPriority={i < KOLS.length ? "high" : "low"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
