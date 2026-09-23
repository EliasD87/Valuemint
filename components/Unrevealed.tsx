"use client";

import { heldBackFor } from "@/config/reveal";
import { deployment } from "@/config/contracts";
import { revealLong } from "@/lib/unrevealed";
import "./Unrevealed.css";

/**
 * What a holder sees when their piece has no published design yet.
 *
 * ---
 *
 * **It is a tease, not a disclosure.** The first version of this panel said
 * everything true about the commit-reveal — what it means, that the odds do not
 * sharpen as minting goes on, why the order cannot be changed — and read like
 * terms and conditions. Somebody who just minted wants to feel that something
 * is coming, not to be walked through a fairness argument they never doubted.
 *
 * So the copy is one line, and the ODDS DO THE WORK. "Legendary 1" beside a
 * row of larger numbers is the whole pitch: it says what is in the pot and how
 * unlikely the good one is, without a word of persuasion. Everything else that
 * was here is still true and still checkable — it is just not what this moment
 * is for.
 *
 * The proof survives as a link rather than a paragraph. A reader who wants to
 * verify the order was fixed in advance can, in one click; a reader who does
 * not is no longer made to read the argument.
 *
 * Renders nothing for a collection with no held-back tail in
 * `config/reveal.ts` — a third-party contract that simply publishes no design
 * is not awaiting a reveal, and saying so would be a claim about someone
 * else's work.
 */
export function Unrevealed({ collection }: { collection: `0x${string}` | undefined }) {
  const held = heldBackFor(collection);
  if (held === undefined) return null;

  const when = revealLong(held);

  return (
    <section className="ur" aria-labelledby="ur-title">
      <div className="ur-card">
        <h3 className="ur-title" id="ur-title">
          Not revealed yet
        </h3>

        <p className="ur-lead">
          One of <strong>{held.count}</strong> sealed pieces. Yours is revealed {when}.
        </p>

        {/*
          The pot, as a row rather than a list.
          A list of four reads as a table of contents; a row reads as what is
          inside — and puts the rarest count next to the commonest, which is
          the comparison the whole panel exists to make.
        */}
        <ul className="ur-pot">
          {held.tiers.map((t) => (
            <li key={t.name} className={`ur-chip ur-chip-${t.name.toLowerCase()}`}>
              <span className="ur-chip-count">{t.count}</span>
              <span className="ur-chip-name">{t.name}</span>
            </li>
          ))}
        </ul>

        <a
          className="ur-proof"
          href={`${deployment.explorer}/tx/${held.commitmentTx}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {/* The character itself: JSX leaves `&nearr;` as literal text. */}
          Sealed on chain before minting ↗
        </a>
      </div>
    </section>
  );
}
