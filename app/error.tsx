"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The route-level error boundary.
 *
 * Without one, a component that throws anywhere under `app/` renders Next's own
 * error screen: an unstyled page with no header, no way back, and in production
 * no explanation. On a site that moves money that is the worst possible moment
 * to look broken.
 *
 * This keeps the site's chrome, says plainly what happened, and offers the two
 * things that actually help — try again, or go somewhere that works.
 *
 * `reset()` re-renders the segment without a full reload, which is usually
 * enough when the cause was a transient RPC or gateway failure.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The single place a render failure becomes visible to anything outside the
    // browser. Until an error reporter is wired up this is the console; the
    // shape is deliberately the one a reporter would take.
    console.error("[valuemint] render failed", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <section className="page section state-page">
      <p className="eyebrow">Something broke</p>
      <h1>This page didn&rsquo;t load.</h1>
      <p className="lede">
        The marketplace reads everything from the chain as you browse, so this is usually a
        node or gateway that failed to answer rather than anything wrong with your wallet or
        your pieces. Nothing was changed on chain.
      </p>

      <div className="wrap-row state-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={reset}>
          Try again
        </button>
        <Link className="btn btn-lg" href="/">
          Go to Explore
        </Link>
      </div>

      {/* The digest is what ties a user's report to a specific server-side
          failure. Useless to them, and the only useful thing they can send. */}
      {error.digest === undefined ? null : (
        <p className="state-digest">
          Reference <span className="mono">{error.digest}</span>
        </p>
      )}
    </section>
  );
}
