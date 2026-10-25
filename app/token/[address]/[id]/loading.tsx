import "@/styles/token.css";

/**
 * The token page's outline, shown the instant a card is clicked (2026-10-25).
 *
 * Next skips prefetching a dynamic route unless it has a loading state, and
 * without one a click waited on the server with nothing on screen. With it,
 * the page's shape appears at once and the piece fills in, and a hovered card
 * (`WarmLink`) can have this ready before the click.
 *
 * The same blocks the page draws — art, name, trade card, tabs — so nothing
 * jumps when the real page replaces it.
 */
export default function TokenLoading() {
  return (
    <section className="page section page-compact tk" aria-busy="true" aria-label="Loading this piece">
      <div className="tk-layout">
        <div className="tk-col tk-col-art">
          <div className="tk-art">
            <div className="token-placeholder skeleton" />
          </div>
        </div>
        <div className="tk-col tk-col-main">
          <div className="tk-head">
            <span className="skeleton tk-load-line" style={{ width: "9rem" }} />
            <span className="skeleton tk-load-title" />
            <span className="skeleton tk-load-line" style={{ width: "11rem" }} />
          </div>
          <div className="tk-trade">
            <div className="tk-checking">
              <span className="skeleton tk-checking-price" />
              <span className="skeleton tk-checking-btn" />
            </div>
          </div>
          <div className="tk-tabs">
            <div className="tk-tablist" />
            <span className="skeleton tk-load-line" style={{ width: "60%", marginTop: "1rem" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
