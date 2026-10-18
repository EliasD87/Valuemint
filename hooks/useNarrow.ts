"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is at or below `maxWidth` CSS pixels.
 *
 * For the rare case where CSS cannot move a thing far enough: the collection
 * page's mint panel sits in a sidebar on a desktop and belongs above the tabs
 * on a phone, which is a different parent, not a different order. Rendering it
 * once in the right place beats rendering it twice and hiding one — two panels
 * would mean two `id="mint"` anchors and two sets of reads.
 *
 * `false` on the server and on the first client render, so hydration matches;
 * a phone then moves the panel up on the next frame.
 */
export function useNarrow(maxWidth: number): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
