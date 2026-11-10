"use client";

/**
 * A sort or filter toggle.
 *
 * Lifted out of the market page when the collection page grew its own sort
 * controls. It is three lines, and the reason to share it rather than copy it
 * is `aria-pressed`: a duplicate would eventually get the styling and drop the
 * state, leaving a control that looks selected to sighted users and reads as an
 * ordinary button to everyone else.
 */
export function Sortie({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** A coloured dot before the label (`.filt-<tone>` in styles/home.css). */
  tone?: string;
}) {
  return (
    <button type="button" className={tone === undefined ? "filt" : `filt filt-${tone}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
