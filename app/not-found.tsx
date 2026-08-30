import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not found",
  // A 404 in a search index is worse than no page at all.
  robots: { index: false, follow: true },
};

/**
 * Shown for any URL that does not resolve, and by `notFound()` from a route
 * that could not find its collection or token.
 *
 * The routes most likely to land here are `/collection/[address]` and
 * `/token/[address]/[id]` with an address that is not an ERC-721, so the copy
 * names that case rather than talking about pages in general.
 */
export default function NotFound() {
  return (
    <section className="page section state-page">
      <p className="eyebrow">Not found</p>
      <h1>There&rsquo;s nothing at this address.</h1>
      <p className="lede">
        Either the link is wrong, or it points at a contract that is not an ERC-721 on
        ValueChain. The marketplace only shows what it can actually read from the chain.
      </p>

      <div className="wrap-row state-actions">
        <Link className="btn btn-primary btn-lg" href="/collections">
          Browse collections
        </Link>
        <Link className="btn btn-lg" href="/">
          Go to Explore
        </Link>
      </div>
    </section>
  );
}
