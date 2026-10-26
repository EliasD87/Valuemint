"use client";

import { useAllCollections } from "@/hooks/useAllCollections";
import { WarmChain } from "@/components/WarmChain";
import { ListPrompt } from "@/components/ListPrompt";
import { Front } from "@/components/Front";
import { useExploreSummary } from "@/hooks/useExploreSummary";
import type { ExploreSummary } from "@/lib/exploreTypes";
import type { FrontSnapshot } from "@/lib/frontTypes";

/**
 * The front page (2026-10-25). See components/Front.tsx.
 *
 * Until today this was a hero the height of the screen — a headline over a
 * fanned deck of collection covers — with the market starting below the fold.
 * It is now the market itself: a spotlight banner, what is for sale, what is
 * minting and what just sold, all on the first screen.
 */
export function Explore({
  summary: baked,
  front,
}: {
  summary: ExploreSummary | undefined;
  /** The first screen's listings and mints, from the index (lib/frontSnapshot.ts). */
  front: FrontSnapshot | undefined;
}) {
  /**
   * Collections only. No tokens.
   *
   * The registry: names, mint state, and which contracts anything vouches for.
   * Every section filters through it, because the order book and the index are
   * both permissionless and an impostor contract can appear in either.
   */
  const { collections } = useAllCollections();

  /**
   * The market's figures, baked into the page on the server (app/page.tsx).
   * Nothing above the listings grid waits on the chain.
   */
  const summary = useExploreSummary(baked);

  return (
    <>
      {/* Nothing renders; it fills the shared caches a moment after paint —
          the order book included, which the listings grid reads too, so the
          grid costs no scan of its own. */}
      <WarmChain />

      {/*
        Beside `WarmChain` for the same reason: it renders nothing until well
        after paint, and nothing on this page waits for it. It is the one place
        somebody is told they are holding pieces they could be selling —
        `/portfolio` only says so to people who already went looking.
      */}
      <ListPrompt />

      <Front summary={summary} collections={collections} snapshot={front} />
    </>
  );
}
