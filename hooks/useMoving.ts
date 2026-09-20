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
let queued: ReturnType<typeof setTimeout> | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;

function sweep(): void {
  queued = undefined;
  for (const check of [...watching]) check();
}

/**
 * Coalesce into one pass, on a TIMER rather than a frame.
 *
 * This used `requestAnimationFrame`, which was the wrong choice for the exact
 * reason this whole fallback exists: a frame callback belongs to the rendering
 * step, and the rendering step is what stops. Measured in this project's
 * preview pane, where `visibilityState` is permanently `hidden` because of our
 * own `frame-ancestors` header: `requestAnimationFrame` never ran, and neither
 * did `scroll`, `resize`, `ResizeObserver` or `MutationObserver`. Only
 * `setTimeout` survived. So a rAF-coalesced sweep is a sweep that never
 * happens, and the grid stayed on nine animated cards however far it scrolled.
 */
function schedule(): void {
  if (queued !== undefined) return;
  queued = setTimeout(sweep, 100);
}

function watch(check: () => void): () => void {
  if (watching.size === 0) {
    /** `capture`, so a scrolling container inside the page counts too. */
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    /**
     * And a slow heartbeat, because the events above can be silent too.
     *
     * It only runs while something is still waiting to be looked at, and it
     * stops the moment the last one upgrades — on a page where everything is
     * already on screen it never starts. A sweep is one
     * `getBoundingClientRect` per waiting card, which is a layout read and
     * costs microseconds; a card that scrolls into view is worth more.
     */
    ticker = setInterval(sweep, 800);
  }
  watching.add(check);

  return () => {
    watching.delete(check);
    if (watching.size === 0) {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (ticker !== undefined) clearInterval(ticker);
      ticker = undefined;
      if (queued !== undefined) clearTimeout(queued);
      queued = undefined;
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
 *
 * A FAILED pull is forgotten, and that is not a detail. This map is keyed by
 * URL and shared by every card on the page, so a single rejection cached here
 * is permanent for the whole tab: every card pointing at that artwork asks for
 * the animation, gets the old failure back, and sits on its still for as long
 * as the tab is open.
 *
 * Navigating away is enough to cause one. An in-flight `<img>` load is
 * cancelled by the browser when the page changes, which fires `onerror` — so
 * somebody who clicks into a piece while the front page is still warming, then
 * arrives on a page showing that same artwork, poisons it on the way in. That
 * is precisely the report: "if warm fetch is happening and I went to the gif
 * nft it stays as still image... if I fast clicked".
 *
 * Deleting the entry costs nothing when the pull worked, and lets the next
 * card retry when it did not.
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

  /**
   * Forget a failure so it is not believed forever.
   *
   * Attached with `void` rather than returned: the caller still receives
   * `started` and still sees the rejection, this is only the bookkeeping. It
   * also means the rejection is handled here, so an aborted load does not
   * surface as an unhandled promise rejection in the console.
   */
  void started.catch(() => {
    if (fetched.get(url) === started) fetched.delete(url);
  });

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
     * On screen, and that gates the SWAP as well as the download.
     *
     * This briefly did not. To fix a grid where the top rows moved and the rest
     * sat still, a card whose file was already downloaded was allowed to swap
     * without waiting to be looked at — the bytes were in hand, so it looked
     * free. It is not free. A collection where every token shares one artwork
     * then put all sixty cards onto a 124-frame animation at once, and a
     * browser asked to run sixty simultaneous animations stops running them:
     * the whole grid went back to stills, which is worse than the fault it was
     * meant to cure and was reported as exactly that.
     *
     * Decoding is the cost, not the download, and only what is on screen should
     * pay it. What actually fixed the original complaint is further up — the
     * position check repeats on scroll now instead of firing once at 1.2s, so a
     * card that the observer never spoke for still upgrades when it is reached.
     * `free` is not needed for that and is gone.
     */
    if (!seen) return;
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
  }, [upgradeable, seen, movingSrc]);

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
