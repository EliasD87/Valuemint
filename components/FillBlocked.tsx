"use client";

import type { ReactNode } from "react";
import type { FillBlock } from "@/lib/fillCheck";
import "./FillBlocked.css";

/**
 * Why nothing was sent, wherever a fill can be attempted.
 *
 * A component rather than markup repeated three times, because the first
 * version was markup written once — inside the token page — and the check ran
 * silently everywhere else. Pressing Accept on an offer that had just been
 * withdrawn correctly refused to open a wallet and then said nothing at all,
 * which is a worse experience than the wasted gas it was preventing: the person
 * is left unable to tell a protection from a broken button.
 *
 * Its own stylesheet for the same reason. `.token-gone` lived in
 * `styles/token.css`, which the offer dialog does not import — the identical
 * trap that once rendered the offer stepper as a bare numbered list.
 */
export function FillBlocked({
  blocked,
  children,
}: {
  blocked: FillBlock | undefined;
  /** Anything extra this surface can add — a new price, say. */
  children?: ReactNode;
}) {
  if (blocked === undefined) return null;

  return (
    <div className="fill-blocked" role="status" aria-live="polite">
      <p>{blocked.say}</p>
      {children}
    </div>
  );
}
