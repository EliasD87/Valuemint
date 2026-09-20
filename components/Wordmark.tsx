import type { WordmarkKey } from "@/config/wordmarks";
import "./Wordmark.css";

/**
 * A collection's own wordmark, standing in for its name.
 *
 * Used in three places that size their type very differently — the front
 * page's hero card, the featured grid's card title, and the collection page's
 * heading — so it is measured in `em` and takes the size of whatever it is
 * dropped into. There is no `size` prop and there should not be one: the
 * caller already decided how big its text is.
 *
 * It is a `role="img"` span with a background rather than an `<img>`, because
 * the two theme cuts are swapped in CSS and this site has THREE theme states,
 * not two: an explicit light choice, an explicit dark one, and a system
 * default that stamps no attribute at all. `<picture>` with
 * `prefers-color-scheme` can only see the last, so anybody who had used the
 * theme toggle would get the wrong cut.
 *
 * `name` is not optional and is not decoration. It is the accessible name, so
 * the page reads identically whether or not the drawing arrives — and every
 * caller already has it, because the name is what this replaces.
 */
export function Wordmark({
  mark,
  name,
  on = "surface",
  className,
}: {
  mark: WordmarkKey;
  /** What it says. Becomes the accessible name. */
  name: string;
  /**
   * What it sits on.
   *
   * `surface` follows the theme, for a card body or a page heading. `art`
   * pins the light-on-dark cut, for a mark sitting over artwork — the hero
   * deck's pieces all carry a dark ground, so there the theme is irrelevant
   * and following it would be wrong half the time.
   */
  on?: "surface" | "art";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={[
        "wordmark",
        `wordmark-${mark}`,
        on === "art" ? "wordmark-on-art" : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
