"use client";

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * When this renders, the root layout did not, so there is no header, no fonts,
 * no theme attribute and no stylesheet — this component replaces `<html>` and
 * `<body>` outright. That is why every style here is inline and every colour is
 * a literal: importing the stylesheet would mean trusting the same module graph
 * that just failed.
 *
 * Deliberately plain. Its only jobs are to not be a white screen, to say
 * something true, and to offer a reload.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem 1.25rem",
          background: "#0d0f13",
          color: "#eef1f6",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p
            style={{
              margin: "0 0 0.9rem",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#737e90",
            }}
          >
            ValueMint
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(1.6rem, 5vw, 2.3rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}
          >
            The site failed to start.
          </h1>
          <p style={{ margin: "1rem 0 0", color: "#a3adbd" }}>
            This is a fault on our side, not with your wallet. Nothing was signed and
            nothing was changed on chain.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              minHeight: "44px",
              padding: "0.7rem 1.6rem",
              borderRadius: "999px",
              border: "1px solid #eef1f6",
              background: "#eef1f6",
              color: "#0d0f13",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>

          {error.digest === undefined ? null : (
            <p style={{ marginTop: "1.5rem", fontSize: "0.82rem", color: "#737e90" }}>
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
