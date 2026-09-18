"use client";

import { useEffect, useRef, useState } from "react";
import { stillUrl } from "@/lib/media";

/**
 * Swap a still for its animation, once it is worth having and has arrived.
 *
 * Shared by the token page and the card grids, which want the same thing for
 * different reasons and at different weights.
 *
 * Three rules make this affordable, and the middle one is the interesting one:
 *
 *   1. Nothing is fetched for a card that is off screen.
 *   2. **One fetch per distinct artwork URL, for the whole page.** Collections
 *      of this kind point every token at one file — Cybereator has 2,233
 *      tokens and one GIF — so a grid of sixty cards is one download that they
 *      all then swap to at once, not sixty. Without this the feature would be
 *      unshippable; with it, the common case costs a single image.
 *   3. Two at a time, so a grid whose art genuinely differs per token trickles
 *      rather than floods.
 *
 * And it is skipped entirely for a visitor who has asked for less motion or
 * less data. Neither is a preference to argue with.
 */

/** In flight or done, keyed by URL. Lives as long as the tab. */
const fetched = new Map<string, Promise<void>>();

/** How many animations may be downloading at any moment. */
const AT_ONCE = 2;

/**
 * How far outside the viewport still counts as "about to be looked at".
 *
 * Roughly a screen's warning, so the animation has usually arrived by the time
 * the card has. Used by both paths below, which must agree or a card could be
 * near enough for one and not the other.
 */
const MARGIN = 300;

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < AT_ONCE) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  const next = waiting.shift();
  if (next !== undefined) next();
}

/**
 * Pull a URL into the browser's cache.
 *
 * Resolving means the bytes are there, so the `<img>` that swaps to it changes
 * in one frame instead of blanking for the ten seconds the first fetch of a
 * 6.58 MB source can take.
 */
function pull(url: string): Promise<void> {
  const already = fetched.get(url);
  if (already !== undefined) return already;

  const started = acquire().then(
    () =>
      new Promise<void>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          release();
          resolve();
        };
        img.onerror = () => {
          release();
          reject(new Error(`could not load ${url}`));
        };
        img.src = url;
      }),
  );

  fetched.set(url, started);
  return started;
}

/**
 * Whether this visitor wants moving pictures at all.
 *
 * Read at the moment of upgrading rather than at render, so it cannot differ
 * between the server and the client and cause a hydration mismatch.
 */
function wanted(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  /** Not in every browser, and absent means no opinion rather than no. */
  const link = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;

  if (link?.saveData === true) return false;
  if (typeof link?.effectiveType === "string" && !link.effectiveType.includes("4g")) return false;

  return true;
}

export function useMoving(
  src: string,
  {
    /** The width the still is already being shown at. */
    still,
    /**
     * The width to ask for the animation at, by screen — smaller, because an
     * animation costs many times its still.
     *
     * Measured on Cybereator's 125 frames through `/api/still`:
     *
     *     192px    500,500 B
     *     256px    799,648 B
     *     384px  1,592,266 B
     *     512px  2,302,150 B
     *
     * A desktop card renders about 325px, so 256 would visibly soften the
     * moment the picture started moving — which is its own bug report. A phone
     * card is about 180px, where 256 is already generous. Hence two numbers,
     * chosen at upgrade time rather than at render, so the server and the
     * client cannot disagree about the URL.
     */
    moving,
    /**
     * False for a thumbnail too small to be worth it, or where the caller
     * wants the still regardless.
     */
    enabled = true,
    /**
     * Wait until the element is on screen. Off for the token page, where the
     * artwork is the reason the page was opened.
     */
    whenVisible = true,
  }: {
    still: number;
    moving: { wide: number; narrow: number };
    enabled?: boolean;
    whenVisible?: boolean;
  },
): { src: string; ref: (node: Element | null) => void } {
  const stillSrc = stillUrl(src, still);

  const [shown, setShown] = useState(stillSrc);
  const [seen, setSeen] = useState(!whenVisible);

  /** The node to watch, held in a ref so the callback ref stays stable. */
  const node = useRef<Element | null>(null);

  useEffect(() => {
    setShown(stillSrc);
  }, [stillSrc]);

  useEffect(() => {
    if (!whenVisible || seen) return;
    const el = node.current;
    if (el === null || typeof IntersectionObserver === "undefined") {
      // No observer to be had: treat it as visible rather than never upgrading.
      setSeen(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: `${MARGIN}px` },
    );

    io.observe(el);

    /**
     * And a way through if the observer never speaks.
     *
     * `IntersectionObserver` does not deliver while a document is hidden, and
     * "hidden" is broader than a background tab — measured in this project's
     * own preview pane, `visibilityState` is `hidden`, the callback never fires
     * once, and every card therefore sat on its still forever. An upgrade whose
     * single trigger can silently never fire is exactly the failure that has
     * now been reported twice, so there is a second path: after a moment, ask
     * the element where it is. `getBoundingClientRect` needs layout, which
     * always happens, rather than compositing, which does not.
     *
     * It is a fallback and not a replacement — it runs once, and it still
     * refuses a card that is genuinely off screen.
     */
    const timer = window.setTimeout(() => {
      const box = el.getBoundingClientRect();
      const near =
        box.bottom > -MARGIN && box.top < (window.innerHeight || 0) + MARGIN && box.width > 0;
      if (near) {
        setSeen(true);
        io.disconnect();
      }
    }, 1_200);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [whenVisible, seen]);

  useEffect(() => {
    if (!enabled || !seen) return;
    if (!wanted()) return;

    /** Client-side only, so this can read the screen without a mismatch. */
    const width = window.innerWidth >= 700 ? moving.wide : moving.narrow;
    const movingSrc = stillUrl(src, width, true);

    /**
     * A host `/api/still` will not fetch gets its original untouched, so there
     * is nothing to upgrade to — the two URLs are the same string.
     */
    if (movingSrc === stillSrc) return;

    let live = true;
    pull(movingSrc)
      .then(() => {
        if (live) setShown(movingSrc);
      })
      .catch(() => {
        /* The still is already on screen and stays there. */
      });

    return () => {
      live = false;
    };
  }, [enabled, seen, src, stillSrc, moving.wide, moving.narrow]);

  /**
   * A stable callback ref. React attaches refs before effects run, so the
   * observer above always finds the node on the first pass.
   */
  return {
    src: shown,
    ref: (el: Element | null) => {
      node.current = el;
    },
  };
}
