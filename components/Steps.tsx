"use client";

import "./Steps.css";

/**
 * The rungs a wallet action needs, and which one is being asked for.
 *
 * ## Why this is a component and not two copies of some markup
 *
 * It was two copies of some markup. `TokenView` and `OfferForm` each wrote out
 * their own `<ol className="token-steps">`, and the rules that made it a row of
 * pills lived in `styles/token.css` — which only the token page imports. On the
 * token page it looked like a stepper. In the offer dialog, which opens from a
 * card on /market, /collection and /portfolio, none of those rules were loaded,
 * so it fell back to a bare ordered list: the browser drew its own `1. 2. 3.`
 * markers *and* each row drew the number inside it, giving
 *
 *     1. ✓Wrap
 *     2. 2Allow
 *     3. 3Offer
 *
 * The class name is what allowed it. `token-steps` in a file called `token.css`
 * reads like something belonging to the token page, so a second caller
 * borrowing it inherited a dependency nothing stated. The styles live next to
 * the component that owns them now, and the component imports them itself —
 * which is the only arrangement where using it cannot forget them.
 *
 * ## The shape
 *
 * Dots joined by a line rather than separate boxes, because these are one
 * sequence and a row of tiles reads as a set of choices. A finished rung
 * carries a tick and colours the line behind it, so how far along you are is
 * legible without reading a word.
 *
 * Two rungs or three; both callers are covered and the row divides evenly
 * either way.
 */

export type StepState = "done" | "now" | "next";

export interface Step {
  label: string;
  state: StepState;
}

export function Steps({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <ol className="steps" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.label} className={`step is-${s.state}`}>
          {/*
            The marker is decorative: a screen reader gets the list's own
            numbering and the `aria-current` below, which says where you are
            in words rather than as a tick nobody can hear.
          */}
          <span className="step-dot" aria-hidden="true">
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span className="step-label" aria-current={s.state === "now" ? "step" : undefined}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
