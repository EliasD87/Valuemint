"use client";

import { Fragment, useEffect, useState } from "react";
import "./FocusLine.css";

/**
 * A line that reads like a lens racking focus: every word soft, one word sharp.
 *
 * The sharp word carries a camera's focus reticle, and the focus walks the
 * sentence on its own so the footer has something happening in it without
 * anybody touching it. Pointing at a word takes the focus there and keeps it
 * there, which is the whole interaction — there is nothing to click and nothing
 * to dismiss.
 *
 * The text is one string and stays one string. It is split for rendering only,
 * with the spaces kept as real text nodes between the spans, so the accessible
 * name is the sentence rather than a list of words — and `filter` does not
 * affect layout, so none of this moves anything.
 */
export function FocusLine({
  text,
  className,
  /** How long each word holds focus. */
  dwellMs = 1500,
}: {
  text: string;
  className?: string;
  dwellMs?: number;
}) {
  const words = text.split(" ");

  const [at, setAt] = useState(0);
  /** A pointer is choosing, so the cycle stops arguing with it. */
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);

  /**
   * Reduced motion turns this off rather than slowing it down.
   *
   * Read here and not in CSS alone, because the blur is only half of it: the
   * cycle is a thing moving on screen every second and a half, and a media
   * query cannot stop a timer. With `still` set nothing is focused, which the
   * stylesheet renders as every word sharp — the sentence, plainly.
   */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (held || still) return;
    const tick = setInterval(() => setAt((n) => (n + 1) % words.length), dwellMs);
    return () => clearInterval(tick);
  }, [held, still, words.length, dwellMs]);

  const sharp = still ? -1 : at;

  return (
    <p
      className={["foc", className].filter(Boolean).join(" ")}
      /* Leaving the line hands it back to the cycle. */
      onPointerLeave={() => setHeld(false)}
    >
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span
            className={`foc-word${i === sharp ? " is-sharp" : ""}`}
            /*
              `pointerenter`, not `mouseover`: it does not fire again for the
              word's own descendants, and there is exactly one thing to do here
              — take the focus and hold it.
            */
            onPointerEnter={() => {
              setHeld(true);
              setAt(i);
            }}
          >
            {word}
          </span>
          {/* A real space, so the sentence is still a sentence to a reader. */}
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </p>
  );
}
