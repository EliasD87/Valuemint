"use client";

import { useEffect, useState } from "react";

/**
 * Whether a media query matches, for the cases CSS cannot answer.
 *
 * Hiding something with `display: none` is almost always the right tool and
 * this is not a substitute for it: a hidden element is still built, still
 * mounted, and still runs whatever its effects run. That is fine for a caption
 * and wrong for something expensive — a few hundred SVG nodes, a
 * ResizeObserver and a pointer pipeline that exist only to be invisible.
 *
 * **Starts false, on the server and on the first client render**, which is what
 * keeps hydration honest: the server has no viewport, so any other default
 * would be a guess that React then has to reconcile. Anything gated on this
 * therefore appears one tick after mount, and must be something the page is
 * complete without.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mq = window.matchMedia(query);
    const read = () => setMatches(mq.matches);

    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);

  return matches;
}
