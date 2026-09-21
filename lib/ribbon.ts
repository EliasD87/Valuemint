/**
 * The geometry behind the KOL ribbon — `components/KolRibbon.tsx`.
 *
 * It lives here, away from the DOM, because it is the part that has been wrong
 * twice. Both times the component looked plausible and the row came apart on
 * screen; both faults are properties of these numbers alone, and
 * `ribbon.test.ts` now asserts them without a browser.
 *
 * A belt of square cards runs along a wave. One parameter `u` runs down the
 * belt and everything is read off it: how big a card is drawn, how far it has
 * turned, and where on the screen it lands.
 *
 *     scale(u) = eye / (eye − amp · cos u)    near at a crest, far at a trough
 *     yaw(u)   = yaw · sin u                  flat at both, turned between
 *
 * Each card carries its **own** `perspective()`, rather than the row sharing
 * one on a parent. That is what makes the packing solvable: under a local
 * perspective the keystone happens about the card's own centre, so the width a
 * card covers depends only on how far it has turned and not on where it is.
 * Sharing one vanishing point instead multiplies every card's x by its own
 * scale, and two cards a fixed distance apart then land `x·Δm` out of place —
 * which, measured, was enough to project cards past one another and scramble
 * the order along the row.
 */

/** Everything the shape of one wave depends on. */
export interface Wave {
  /** The card's side, in CSS pixels, before any scaling. */
  card: number;
  /** How far the wave carries a card towards the camera, and away from it. */
  amp: number;
  /** Eye distance. Must exceed `amp`, or a crest lands on the lens. */
  eye: number;
  /** Yaw at the steepest point, in radians. */
  yaw: number;
  /** Each card's own perspective, in card widths. */
  keystone: number;
  /** Cards from one crest to the next. */
  perWave: number;
}

/** The parameter between one card and the next. */
export const stepOf = (w: Wave) => (2 * Math.PI) / w.perWave;

/** How big whatever sits at this point on the wave is drawn. */
export const magAt = (w: Wave, u: number) => w.eye / (w.eye - w.amp * Math.cos(u));

/** How far it has turned there. */
export const yawAt = (w: Wave, u: number) => w.yaw * Math.sin(u);

/**
 * How far a card reaches either side of its own centre, on screen.
 *
 * Rotating a square of side `W` by θ under its own perspective `P` carries its
 * edges to ∓(W/2)·sin θ in depth, so one is drawn nearer and the other further
 * and the two half-widths come out
 *
 *     right = (W/2)·cos θ · P / (P + (W/2)·sin θ)
 *     left  = (W/2)·cos θ · P / (P − (W/2)·sin θ)
 *
 * magnified by the scale at that point.
 *
 * **They are not equal, and that is the whole reason this function exists.** A
 * turned card is not centred on the space it takes up: at the steepest yaw here
 * its two halves differ by about 12 screen pixels. Spacing the row by half of
 * each card's total width — which is what the obvious `cover / 2` does — is
 * therefore wrong by that much, and measured at the shipped numbers it left a
 * 6% gap at the pinch, exactly where the row is tightest and it shows most.
 *
 * `P − (W/2)·sin θ` must stay positive, which needs `keystone > sin(yaw) / 2`.
 * At 1.6 against a yaw of 1.3 there is a factor of three in hand.
 */
export function extentsAt(w: Wave, u: number): { left: number; right: number } {
  const yaw = yawAt(w, u);
  const half = w.card / 2;
  const p = w.keystone * w.card;
  const depth = half * Math.sin(yaw);
  const reach = half * Math.cos(yaw) * p * magAt(w, u);
  return { right: reach / (p + depth), left: reach / (p - depth) };
}

/** The width one card covers on screen at this point on the wave. */
export function coverAt(w: Wave, u: number): number {
  const { left, right } = extentsAt(w, u);
  return left + right;
}

/** One wave's worth of screen positions, sampled evenly in `u`. */
export interface WaveTable {
  /** `screen[i]` is the x reached at `u = i · 2π / samples`, from zero. */
  screen: Float64Array;
  /** How much screen one whole wave covers. */
  perWaveX: number;
  samples: number;
}

/**
 * Integrate `dX/du = coverAt(u) / step` across one wave.
 *
 * Over the `step` of parameter between two cards the screen advances by the
 * width the turned, scaled card covers on it, so cards meet edge to edge
 * everywhere on the wave — and because the integrand is positive, `X` rises
 * strictly and the row can never fold through itself.
 *
 * ## Two correction terms, neither of them decoration
 *
 * What abutment actually needs is that the gap between two neighbours is the
 * right-hand reach of the first plus the left-hand reach of the second:
 *
 *     X(u + step) − X(u) = right(u) + left(u + step)
 *
 * Split each card's reaches into their mean `A = C/2` and their difference
 * `D = (right − left)/2`, and that comes to
 *
 *     = (C(u) + C(u + step)) / 2  −  (D(u + step) − D(u))
 *
 * Two things to arrange, then, and one integrand to do it with.
 *
 * **The asymmetry.** The second bracket is already a difference of `D` across
 * the interval, so subtracting `D′` from the integrand reproduces it exactly —
 * no approximation at all. Leaving it out is a 6% gap at the pinch.
 *
 * **The quadrature.** The first bracket is the *trapezoid* of `C` across the
 * interval, while an integral gives its *mean*, and the two differ by the
 * trapezoid rule's own error — Euler–Maclaurin, `(step²/12)·C″ −
 * (step⁴/720)·C⁗`. `C` swings from a trough card to a crest card across half a
 * wave, so that is not a rounding difference either: on its own it was a
 * further 7.4%, and it is peaked enough at a crest that the second term is
 * still worth several pixels there.
 *
 * `C″`, `C⁗` and `D′` all integrate to zero across a whole wave, because `C`
 * and `D` are periodic — so `perWaveX` is untouched and the ring still closes
 * exactly. All three are taken by central difference off the sampled curve
 * rather than differentiated by hand, which keeps them honest if the shape
 * changes.
 *
 * ## What is left, and why it cannot be zero
 *
 * A little. Asking for exact abutment at *every* phase has no solution: in
 * Fourier terms the multiplier is `−i·cot(n·step/2)`, which is singular at
 * `n = perWave` — the harmonic that sits exactly on the card spacing, and is
 * therefore invisible in a difference taken at that spacing. Whatever `C` has
 * at that one frequency cannot be arranged away. It comes to under two percent
 * of a card, and only beside the crest, where the cards are largest and a
 * hairline reads as a join rather than a gap.
 */
export function buildWave(w: Wave, samples = 1024): WaveTable {
  const step = stepOf(w);
  const du = (2 * Math.PI) / samples;
  const screen = new Float64Array(samples + 1);

  // u = 0 is a crest: the yaw is zero there and the card is at full width.
  const cover = new Float64Array(samples);
  const asym = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const { left, right } = extentsAt(w, i * du);
    cover[i] = left + right;
    asym[i] = (right - left) / 2;
  }

  /** Wrapping reads, because both curves are periodic in `u`. */
  const at = (a: Float64Array, i: number) => a[((i % samples) + samples) % samples] ?? 0;

  const step2 = step * step;
  const rate = (i: number) => {
    const c0 = at(cover, i);
    const second = (at(cover, i - 1) - 2 * c0 + at(cover, i + 1)) / (du * du);
    const fourth =
      (at(cover, i - 2) -
        4 * at(cover, i - 1) +
        6 * c0 -
        4 * at(cover, i + 1) +
        at(cover, i + 2)) /
      (du * du * du * du);
    const slope = (at(asym, i + 1) - at(asym, i - 1)) / (2 * du);
    return (c0 + (step2 / 12) * second - ((step2 * step2) / 720) * fourth) / step - slope;
  };

  let acc = 0;
  let prev = rate(0);
  for (let i = 1; i <= samples; i++) {
    const cur = rate(i);
    acc += ((prev + cur) / 2) * du;
    screen[i] = acc;
    prev = cur;
  }

  return { screen, perWaveX: acc, samples };
}

/**
 * Where on the screen the card at parameter `u` belongs.
 *
 * The table is sampled evenly in `u`, so the entry is indexed rather than
 * searched for, and each whole wave the card is along adds one wave's worth of
 * screen — which is what lets the belt close into a ring. Wrapping a card by a
 * whole number of waves moves it by exactly a whole number of belt lengths and
 * changes nothing else about it.
 */
export function screenAt(t: WaveTable, u: number): number {
  const wave = Math.floor(u / (2 * Math.PI));
  const at = ((u - wave * 2 * Math.PI) / (2 * Math.PI)) * t.samples;
  const i0 = Math.min(t.samples - 1, Math.floor(at));
  const a0 = t.screen[i0] ?? 0;
  const a1 = t.screen[i0 + 1] ?? a0;
  return wave * t.perWaveX + a0 + (a1 - a0) * (at - i0);
}
