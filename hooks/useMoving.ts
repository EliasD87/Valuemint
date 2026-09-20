"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * The URLs whose animation is downloaded, and everyone waiting to hear.
 *
 * Rule 2 above says one fetch per distinct artwork URL — and that cuts both
 * ways. Cybereator points all 2,233 of its tokens at one GIF, so once ANY card
 * has pulled it, showing it on the other fifty-nine costs nothing: no request,
 * no bytes, no decode that was not going to happen anyway.
 *
 * Gating those fifty-nine behind their own visibility check bought nothing and
 * cost the bug this exists to fix — a grid where the top rows moved and the
 * rest sat on a still, reported as "some loaded gif and some did not". Measured
 * on the live collection: 9 of 60.
 *
 * So visibility gates the DOWNLOAD, which is the expensive part, and never the
 * swap. A collection whose tokens genuinely differ is unaffected: nothing is in
 * hand for those, so every card still waits its turn.
 */
const ready = new Set<string>();
const waitingOnReady = new Set<() => void>();

function announce(url: string): void {
  ready.add(url);
  for (const listener of [...waitingOnReady]) listener();
}

/**
 * Re-ask where a card is whenever the page moves.
 *
 * The position check below used to be a single `setTimeout`, and one shot is
 * not enough: a card that was off screen at 1.2 s stayed on its still for the
 * life of the page, because the only other trigger was the observer that had
 * already proved it might never speak. Together those two are not a fallback
 * and a primary — they are two things that can both be silent.
 *
 * One listener for the whole page, passive, coalesced into a frame, and removed
 * the moment the last waiting card has upgraded. Where the observer works this
 * costs a single sweep before it is torn down.
 */
const watching = new Set<() => void>();
let scheduled = false;

function sweep(): void {
  scheduled = false;
  for (const check of [...watching]) check();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(sweep);
}

function watch(check: () => void): () => void {
  if (watching.size === 0) {
    /** `capture`, so a scrolling container inside the page counts too. */
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
  }
  watching.add(check);

  return () => {
    watching.delete(check);
    if (watching.size === 0) {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    }
  };
}

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
          /** Now free for every other card pointing at the same file. */
          announce(url);
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
     * The width to ask for the animation at — smaller than the still, because
     * an animation costs many times one.
     *
     * Measured through the route on Cybereator's 125 frames: 500,500 B at
     * 192px, 799,648 B at 256, 1,592,266 B at 384, 2,302,150 B at 512. One
     * width for every caller, so each artwork has ONE animated file that every
     * screen shares — two widths meant two files, each generated and cached
     * separately, and the first request for a width nobody had asked for
     * measured 8,217 ms against a warm 904 ms.
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
    moving: number;
    enabled?: boolean;
    whenVisible?: boolean;
  },
): { src: string; ref: (node: Element | null) => void } {
  const stillSrc = stillUrl(src, still);
  const movingSrc = useMemo(() => stillUrl(src, moving, true), [src, moving]);

  /**
   * A host `/api/still` will not fetch gets its original untouched, so the two
   * URLs are the same string and there is nothing to upgrade to.
   */
  const upgradeable = enabled && movingSrc !== stillSrc;

  const [shown, setShown] = useState(stillSrc);
  const [seen, setSeen] = useState(!whenVisible);

  /** Is this artwork's animation already downloaded, by this card or another? */
  const [free, setFree] = useState(false);

  /** The node to watch, held in a ref so the callback ref stays stable. */
  const node = useRef<Element | null>(null);

  useEffect(() => {
    setShown(stillSrc);
  }, [stillSrc]);

  /**
   * Listen for someone else finishing the download of this same file.
   *
   * On a collection where every token shares one artwork this fires once and
   * releases the entire grid at the same instant, which is what a grid of one
   * animation should have done all along.
   */
  useEffect(() => {
    if (!upgradeable) return;

    if (ready.has(movingSrc)) {
      setFree(true);
      return;
    }

    const check = () => {
      if (ready.has(movingSrc)) setFree(true);
    };
    waitingOnReady.add(check);
    return () => {
      waitingOnReady.delete(check);
    };
  }, [upgradeable, movingSrc]);

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
     * own preview pane, `visibilityState` is `hidden` and the callback never
     * fires once. `getBoundingClientRect` needs layout, which always happens,
     * rather than compositing, which does not.
     *
     * It runs on a beat after mount AND on every scroll and resize, because one
     * shot was not enough: measured on the live collection at 1280x900, exactly
     * the 9 cards inside `innerHeight + MARGIN` at 1.2 s ever upgraded, and the
     * remaining 51 stayed on their stills however far the page was scrolled.
     * A check that only ever runs once is not a fallback for a trigger that
     * might never fire — it is a second thing that can also be silent.
     */
    const check = () => {
      const box = el.getBoundingClientRect();
      /** Zero-width means not laid out yet; ask again on the next sweep. */
      if (box.width === 0) return;
      const height = window.innerHeight || document.documentElement.clientHeight || 0;
      if (box.bottom > -MARGIN && box.top < height + MARGIN) {
        setSeen(true);
        io.disconnect();
      }
    };

    const timer = window.setTimeout(check, 1_200);
    const unwatch = watch(check);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      unwatch();
    };
  }, [whenVisible, seen]);

  useEffect(() => {
    if (!upgradeable) return;

    /**
     * Visibility gates the download, not the swap — so a card whose file is
     * already in hand (`free`) upgrades without waiting to be looked at, and a
     * card that would have to fetch one still waits its turn.
     */
    if (!seen && !free) return;
    if (!wanted()) return;

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
  }, [upgradeable, seen, free, movingSrc]);

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
