import { TokenCardSkeleton } from "@/components/TokenCard";
import "@/styles/home.css";

/**
 * A collection page's outline, shown the instant its link is clicked
 * (2026-10-25).
 *
 * Next skips prefetching a dynamic route unless it has a loading state, and
 * without one a click waited on the server with nothing on screen. The banner
 * and a grid of card outlines hold the page's shape until the real one lands.
 */
export default function CollectionLoading() {
  return (
    <section className="page section page-compact" aria-busy="true" aria-label="Loading this collection">
      <div className="skeleton coll-load-band" />
      <div className="skeleton coll-load-name" />
      <div className="grid-tokens">
        {Array.from({ length: 12 }, (_, i) => (
          <TokenCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
