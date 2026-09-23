/**
 * The arrows inside a button that goes somewhere.
 *
 * Drawn rather than typed. The `&rarr;` glyph comes from whichever font the
 * browser falls back to, sits on the text baseline rather than the button's
 * centre, and is a different weight in every face; a stroke drawn at the
 * text's own colour lines up the same in all of them. Decorative: the
 * button's words say where it goes.
 */

export function ArrowRight() {
  return (
    <svg className="btn-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3 8h9.5M8.5 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowLeft() {
  return (
    <svg className="btn-arrow btn-arrow-back" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M13 8H3.5M7.5 4l-4 4 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
