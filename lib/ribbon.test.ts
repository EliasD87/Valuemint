import { describe, expect, it } from "vitest";
import { buildWave, coverAt, extentsAt, magAt, screenAt, stepOf, type Wave } from "@/lib/ribbon";

/**
 * The KOL ribbon's packing.
 *
 * Two builds of this shipped-looking and broke on screen, and neither failure
 * had anything to do with the DOM:
 *
 *   1. Cards laid tangent to a literal cosine sheet splayed apart wherever the
 *      sheet curved tighter than a card is wide, leaving black wedges through
 *      the row.
 *   2. Cards spaced by the width they cover in *world* x, under one shared
 *      vanishing point, projected past one another once they were a few
 *      hundred pixels off centre — the order on screen stopped matching the
 *      order along the belt.
 *
 * Both are properties of the numbers alone, which is why they are asserted
 * here rather than looked at. The two that matter are that the row is packed
 * (no gap between neighbours, and no runaway overlap) and that it is ordered
 * (x rises strictly, so nothing can fold through anything else).
 */

/** What the component actually renders with, on a wide screen. */
const WIDE: Wave = {
  card: 140,
  amp: 900,
  eye: 1400,
  yaw: 1.3,
  keystone: 1.6,
  perWave: 8,
};
/** And on a phone, where the wave is shorter so more of it fits. */
const NARROW: Wave = { ...WIDE, perWave: 6 };

/** Both, at the smallest and largest scales `measure` will apply. */
const SCALED: Wave[] = [WIDE, NARROW].flatMap((w) =>
  [0.5, 1, 1.25].map((k) => ({
    ...w,
    card: w.card * k,
    amp: w.amp * k,
    eye: w.eye * k,
  })),
);

describe("the ribbon's wave", () => {
  it("draws a crest card far larger than a trough card", () => {
    /** The whole illusion of depth is this ratio; symmetric scaling has none. */
    expect(magAt(WIDE, 0)).toBeCloseTo(2.8, 1);
    expect(magAt(WIDE, Math.PI)).toBeCloseTo(0.61, 2);
  });

  it("turns a card furthest between the crest and the trough, not at them", () => {
    /** A card lies flat where the sheet does, which is what reads as a sheet. */
    expect(coverAt(WIDE, 0) / magAt(WIDE, 0)).toBeCloseTo(WIDE.card, 6);
    expect(coverAt(WIDE, Math.PI) / magAt(WIDE, Math.PI)).toBeCloseTo(WIDE.card, 6);
    expect(coverAt(WIDE, Math.PI / 2) / magAt(WIDE, Math.PI / 2)).toBeLessThan(WIDE.card * 0.4);
  });

  it("never lets a card cover nothing, at any point on any wave", () => {
    /** A zero would divide the row by zero when it is spaced. */
    for (const w of SCALED) {
      for (let i = 0; i < 360; i++) {
        expect(coverAt(w, (i / 360) * 2 * Math.PI)).toBeGreaterThan(0);
      }
    }
  });
});

describe("the ribbon's packing", () => {
  it("places every card edge to edge with the one before it", () => {
    /**
     * The one that failed twice, stated the way the screen sees it: the gap
     * between two neighbours' centres has to be the first card's right-hand
     * reach plus the second card's left-hand reach. Any more is a black wedge,
     * any less is a card eating its neighbour.
     *
     * Not the mean of the two widths — that is the near miss this file exists
     * to hold the line on. A turned card is not centred on the space it takes
     * up, and spacing by half-widths leaves a visible sliver at the pinch.
     *
     * Checked at a hundred starting phases per wave, not just on the card
     * grid: the belt slides continuously, so a card is at an arbitrary `u` and
     * the spacing has to hold everywhere, not at eight lucky points.
     */
    for (const w of SCALED) {
      const t = buildWave(w);
      const step = stepOf(w);

      for (let i = 0; i < 100; i++) {
        const u = (i / 100) * 2 * Math.PI;
        const apart = screenAt(t, u + step) - screenAt(t, u);
        const want = extentsAt(w, u).right + extentsAt(w, u + step).left;

        /**
         * A share of the smaller of the two cards, because a gap is read
         * against what it sits between.
         *
         * 6% is not arbitrary and not the floor: exact abutment at every phase
         * has no solution at all — see `buildWave` — and what survives is the
         * harmonic of `C` sitting exactly on the card spacing, measured at
         * 0.9% of a card on the long wave and 5.8% on the short one. Without
         * the corrections in `buildWave` it is 16–23%, so this bound is what
         * stops either of them being quietly dropped.
         */
        const smaller = Math.min(coverAt(w, u), coverAt(w, u + step));
        expect(Math.abs(apart - want)).toBeLessThan(smaller * 0.06);
      }
    }
  });

  it("keeps the row in order, so no card can project past another", () => {
    /**
     * The second failure, stated directly. `screenAt` must rise strictly with
     * `u` for the belt's order to survive being drawn.
     */
    for (const w of SCALED) {
      const t = buildWave(w);
      let last = screenAt(t, -4 * Math.PI);

      for (let i = 1; i <= 1600; i++) {
        const next = screenAt(t, -4 * Math.PI + (i / 200) * 2 * Math.PI);
        expect(next).toBeGreaterThan(last);
        last = next;
      }
    }
  });

  it("closes the ring: a whole wave of parameter is a whole wave of screen", () => {
    /**
     * What lets a slot's picture be written once and never again. A card that
     * wraps moves by a whole number of belt lengths and nothing else, so the
     * belt is a ring and no card ever has to change what it shows.
     */
    for (const w of SCALED) {
      const t = buildWave(w);
      for (const u of [0, 0.7, 2.2, 4.9]) {
        for (const waves of [1, 3, 6]) {
          expect(screenAt(t, u + waves * 2 * Math.PI) - screenAt(t, u)).toBeCloseTo(
            waves * t.perWaveX,
            6,
          );
        }
      }
    }
  });

  it("scales the whole picture, rather than changing it", () => {
    /**
     * `measure` multiplies the card, the depth *and* the eye by one factor.
     * Scaling the scene but not the eye would flatten the wave, so the belt at
     * half size has to be half the belt — exactly, not approximately.
     */
    const full = buildWave(WIDE);
    const half = buildWave({ ...WIDE, card: 70, amp: 450, eye: 700 });

    expect(half.perWaveX).toBeCloseTo(full.perWaveX / 2, 6);
    expect(magAt({ ...WIDE, card: 70, amp: 450, eye: 700 }, 1.1)).toBeCloseTo(magAt(WIDE, 1.1), 12);
  });

  it("fits a whole number of cards into the belt at both wave lengths", () => {
    /**
     * The ring only closes on a whole wave, and a slot only keeps one portrait
     * if the belt is also a whole number of rosters. 48 is both, twice over —
     * change either number and this is what catches it.
     */
    const SLOTS = 48;
    expect(SLOTS % WIDE.perWave).toBe(0);
    expect(SLOTS % NARROW.perWave).toBe(0);
    expect(SLOTS % 12).toBe(0);
  });
});
