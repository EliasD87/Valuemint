import type { Metadata } from "next";
import Link from "next/link";
import { GUIDE_STEPS } from "@/config/guide";
import { GuideArt } from "@/components/GuideArt";
import { deployment } from "@/config/contracts";
import "@/styles/guide.css";

/**
 * The guide, in full.
 *
 * A page rather than only a dialog, and deliberately. A dialog can be opened
 * once and never again; a page can be linked in a reply to somebody who is
 * stuck, read on a second device, indexed, and kept open in a tab beside the
 * thing it describes. The pill's panel is the short version of this, built
 * from the same `GUIDE_STEPS` and the same drawings, so the two cannot drift.
 *
 * Every step leads with its picture. Most of what confuses a newcomer here is
 * mechanism — what an allowance is, why a wrapped token exists, what an
 * approval buys — and mechanism is a thing you see in one glance and read in
 * three paragraphs.
 *
 * A server component with no hooks and no wallet: it is words and drawings
 * about how the site works, none of which depend on who is reading. That keeps
 * the whole page out of the client bundle.
 */

export const metadata: Metadata = {
  /* Bare, because the root layout's template appends "· ValueMint" — spelling
     it out here produced "Getting started — ValueMint · ValueMint". */
  title: "Getting started",
  description:
    "How to buy, offer on and sell NFTs on ValueChain: the network, SOSO and WSOSO, " +
    "and the one-time approval before a first sale.",
};

export default function GuidePage() {
  return (
    <section className="page section guide">
      <div className="head">
        <div>
          <p className="eyebrow">Getting started</p>
          <h2>How ValueMint works</h2>
        </div>
        <Link className="head-link" href="/market">
          Go to the listings &rarr;
        </Link>
      </div>

      <p className="guide-intro">
        Four things worth knowing before you buy or sell anything here. None of them take
        long, and none of them are about where the buttons are.
      </p>

      {/* Short enough to skim, and every step is a link you can send someone. */}
      <nav className="guide-toc" aria-label="The steps">
        {GUIDE_STEPS.map((s, i) => (
          <a key={s.id} href={`#${s.id}`}>
            <span aria-hidden="true">{i + 1}</span>
            {s.title}
          </a>
        ))}
      </nav>

      <ol className="guide-steps">
        {GUIDE_STEPS.map((s, i) => (
          <li key={s.id} id={s.id}>
            {/* The drawing first in the source as well as on the page: on a
                narrow screen it stacks above the words, which is the reading
                order this is written for. */}
            <div className="guide-art">
              <GuideArt id={s.id} />
            </div>

            <div className="guide-step">
              <p className="guide-n">Step {i + 1}</p>
              <h3>{s.title}</h3>
              <p className="guide-lead">{s.body}</p>
              {s.more === undefined ? null : <p className="guide-more">{s.more}</p>}
              {s.clip === undefined ? null : (
                <video
                  className="guide-clip"
                  preload="none"
                  poster={s.clip.poster}
                  src={s.clip.src}
                  aria-label={s.clip.alt}
                  muted
                  loop
                  playsInline
                  controls
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Where to go next, and nothing else. The summary that used to sit here
          restated four things the reader had just been told, immediately after
          telling them. */}
      <nav className="guide-end" aria-label="Where to go next">
        <Link href="/market">Listings</Link>
        <Link href="/collections">Collections</Link>
        <Link href="/stats">Stats</Link>
        <Link href="/activity">Activity</Link>
        <a href={deployment.explorer} target="_blank" rel="noreferrer noopener">
          Block explorer
        </a>
      </nav>
    </section>
  );
}
