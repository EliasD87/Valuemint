"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import "./NavProgress.css";

/**
 * A thin bar along the top of the window while a page is on its way.
 *
 * Next prefetches every link it can see, and a prefetched page opens at once.
 * But prefetching waits until the current page has settled, and on a slow
 * connection that takes a while: measured 2026-09-30 from the owner's own
 * connection (~170 ms to Vercel's Cape Town edge), a click on Trenches or
 * Market in the first seconds after landing waited 2.3-3.7 s for the page's
 * data and code, and nothing on screen moved in the meantime. The same click
 * once the prefetch had landed took 232 ms. The wait reads as the site not
 * responding, which is worse than the wait itself.
 *
 * So a click on any link to another page starts the bar at once. Nothing
 * intercepts or changes the navigation; the bar only watches for it.
 *
 * - A navigation that finishes within `SHOW_AFTER_MS` (a prefetched page)
 *   never shows the bar at all, so fast pages do not flicker.
 * - It finishes when the path changes, and gives up after `GIVE_UP_MS` in case
 *   the navigation never happens.
 * - Portalled to `<body>`: the header has `backdrop-filter`, which makes it
 *   the containing block for anything `position: fixed` inside it.
 */
const SHOW_AFTER_MS = 120;
const GIVE_UP_MS = 15_000;
const FADE_MS = 400;

type Phase = "idle" | "waiting" | "running" | "done";

export function NavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mounted, setMounted] = useState(false);
  /** The phase as of now, for timers and effects that must not wait on a render. */
  const current = useRef<Phase>("idle");
  const timers = useRef<number[]>([]);

  const go = (next: Phase) => {
    current.current = next;
    setPhase(next);
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target !== "" && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page, or only a #fragment: nothing is going to load.
      if (url.pathname === window.location.pathname) return;

      clearTimers();
      go("waiting");
      timers.current.push(
        window.setTimeout(() => {
          if (current.current === "waiting") go("running");
        }, SHOW_AFTER_MS),
        window.setTimeout(() => go("idle"), GIVE_UP_MS),
      );
    }

    // Capture, so this sees the click before <Link> handles it.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  /** Arrived. A bar that never showed stays hidden; a showing one completes and fades. */
  useEffect(() => {
    clearTimers();
    if (current.current === "running") {
      go("done");
      timers.current.push(window.setTimeout(() => go("idle"), FADE_MS));
    } else if (current.current !== "idle") {
      go("idle");
    }
  }, [pathname]);

  if (!mounted || phase === "idle" || phase === "waiting") return null;

  return createPortal(
    <div className={`nav-progress is-${phase}`} aria-hidden="true">
      <div className="nav-progress-bar" />
    </div>,
    document.body,
  );
}
