"use client";

import Image from "next/image";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Art } from "@/components/Art";
import { ConnectButton } from "@/components/ConnectButton";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import { KOLS, kolImage, kolLocal, xHandle, type Kol } from "@/config/kols";
import { useKolRewards, type Stage } from "@/hooks/useKolRewards";
import { formatSoso } from "@/lib/format";
import "@/styles/kols.css";

/**
 * The KOL portraits.
 *
 * Given, never sold — so this page is a showcase, never a storefront. The one
 * thing it lets anybody do is for the people on it: connect the wallet they gave
 * us and take their portrait and their share of SOSO from `KolRewards`.
 * Everyone else only looks.
 *
 * Until that contract has an address (`NEXT_PUBLIC_KOL_REWARDS_ADDRESS`) the
 * page is exactly the showcase it was — nothing is read and nothing offered.
 *
 * The three at the top are cutouts standing in front of the letters K, O and L,
 * which is the whole reason they are separate assets from the twelve below: the
 * roster art is square and framed, and a square cannot break out of anything.
 *
 * The letters replaced three plain rounded slabs. Those slabs were a third
 * narrower than the figures standing on them, so all that showed of each was a
 * coloured sliver either side of a character — decoration that read as debris.
 * Spelling the word instead gives the shapes a job: the page now says what it
 * is at the size of the artwork, and the figures rising through the letterforms
 * is the composition rather than an accident of sizing.
 */

/**
 * The three with transparent cutouts, each paired with the letter it stands in.
 *
 * Order is not cosmetic — it spells KOL. Changing it, or dropping one on a
 * narrow screen, leaves a word that is missing a letter, which is why the
 * mobile rules below shrink the row rather than hiding its third member.
 */
const FEATURED = [
  /**
   * `shift` nudges the figure sideways within its own letter, as a fraction of
   * the figure's width. It exists because the three letterforms are not alike:
   * a figure centred on its glyph reads differently on each.
   *
   * K has arms reaching right of its stem, so centred works — the stem shows
   * one side, the arms the other. O is a closed ring and the head sits inside
   * it, which is the best of the three. L is the problem: its ink is a stem on
   * the far left and a foot along the bottom, and a centred figure covers the
   * stem completely, leaving a shape that could be anything. Pushing right
   * stands her on the foot and leaves the stem clear.
   */
  { file: "markinho", letter: "K", tint: "var(--plinth-a)", shift: "0%" },
  // Versioned filename: the artwork was replaced, and the image optimiser
  // caches by source URL — same path with different bytes serves the old cut.
  { file: "lutz-v2", letter: "O", tint: "var(--plinth-b)", shift: "0%" },
  // Replaced Takimi's figure 2026-09-26. A new filename rather than new bytes
  // under the old one, for the same reason as lutz-v2. A broad bust where hers
  // was narrow, so it sits right of centre to leave the stem readable.
  //
  // It was 48%, which cleared the stem entirely but hung the figure 139px past
  // the letter at 1440 — the word read as leaning right. Measured against the
  // figure's own alpha (the sides of the cutout are transparent), stem coverage
  // by shift: 48% and 35% none; 28% only the bottom tenth, where the shoulder
  // crosses; 22% the bottom fifth; 16% the smoke reaches it a quarter down. 28%
  // keeps nine tenths of the stem clear and brings the overhang to 94px, and
  // `.kol-plinth:last-child` in kols.css reserves that overhang so the row
  // centres on the word-plus-figure rather than on the letters alone.
  { file: "cigar-l", letter: "L", tint: "var(--plinth-c)", shift: "28%" },
] as const;

/** The eyebrow's second half: where the claim stands, in two words. */
const STAGE_LABEL: Record<Stage, string> = {
  soon: "Coming soon",
  preparing: "Coming soon",
  open: "Claiming open",
  ended: "Claiming closed",
};

/**
 * The deadline in the reader's own timezone, with the time. A date alone was
 * ambiguous by up to a day — "until Sep 26" read as the whole of the 26th when
 * claiming actually stopped at 19:51 UTC.
 */
const day = (unix: number) =>
  new Date(unix * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export default function Kols() {
  const rewards = useKolRewards();
  const stage = rewards.stage ?? "soon";
  const live = stage === "open" || stage === "ended";
  const total = rewards.totalRewards > 0n ? formatSoso(rewards.totalRewards) : undefined;
  // Everyone gets the same amount (the plan), so the header says what one
  // person receives; if amounts ever differ it falls back to the total.
  const each = rewards.sameReward !== undefined && rewards.sameReward > 0n ? formatSoso(rewards.sameReward) : undefined;

  return (
    <div className="kol">
      <section className="kol-hero">
        <div className="kol-deep" aria-hidden="true" />

        <div className="page kol-hero-inner">
          {/* The production status line and the "list is still open" note were
              working notes addressed at us, not at a visitor. What is left says
              what the set is and who it is for. */}
          {/*
            What the set is and when it is, on one line.

            The status was its own pill under this, which made two uppercase
            tracked labels stacked competing to be read first — and it carried
            `align-self: flex-start` inside a centred column, so it hung 466px
            off the axis everything else lines up on. Both are facts about the
            set, so they belong on the same line; this eyebrow was already an
            inline-flex with a gap, waiting for exactly this.

            Still near the top, for the reason it always was: the page
            otherwise reads as a shop, and nothing here can be acted on yet.
          */}
          <p className="kol-eyebrow">
            {/* An explicit space, or the two halves concatenate in the
                accessible name and are read as "One of oneComing soon". A
                whitespace-only text node generates no flex item, so this
                changes nothing on screen. */}
            One of one{" "}
            <span className="kol-eyebrow-rule" aria-hidden="true" />
            <span className={`kol-soon is-${stage}`}>
              <span className="kol-soon-dot" aria-hidden="true" />
              {STAGE_LABEL[stage]}
            </span>
          </p>
          <h1 className="kol-title">The people who show up</h1>
          <p className="kol-lede">
            A small appreciation collection for the people who keep showing up around SoDEX:
            posting, contributing, trading, helping, and being part of the community.
          </p>

          {/*
            What each of them gets, and who is giving it — one object, so the
            credit reads as part of the offer rather than a logo strip bolted
            underneath. The gift on the left, the sponsor on the right; on a
            phone the two stack with the rule turning horizontal.
          */}
          <div className="kol-sponsor">
            <p className="kol-gift">
              <span className="kol-gift-item">
                <span className="kol-gift-thumbs" aria-hidden="true">
                  {KOLS.slice(0, 3).map((k) => (
                    // Eager: they sit above the fold, and next/image's lazy
                    // observer has been seen never to fire for tiny images.
                    <Image key={k.n} src={kolLocal(k)} alt="" width={48} height={48} loading="eager" />
                  ))}
                </span>
                1/1 portrait NFT
              </span>
              <span className="kol-gift-plus" aria-hidden="true">
                +
              </span>
              <span className="kol-gift-item">
                {/* The white mark on purpose, whatever the site theme: this band
                    is always dark, and the light-theme mark vanishes on it. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- a 4 KB local icon, as in Soso.tsx */}
                <img className="kol-gift-soso" src="/soso-dark.png" alt="" width={128} height={128} />
                SOSO reward
              </span>
            </p>
            <span className="kol-sponsor-rule" aria-hidden="true" />
            <p className="kol-sponsor-by">
              <span>Sponsored by</span>
              <b className="kol-sponsor-mark">ValueChain</b>
            </p>
          </div>

          {/* What each of them receives and how many have. Only once claiming
              has opened: before that the numbers are not settled, and a row of
              blanks reads as broken rather than as "soon". */}
          {live ? (
            <dl className="kol-facts">
              <div>
                <dt>Portraits</dt>
                <dd>{rewards.minted ?? KOLS.length}</dd>
              </div>
              {each !== undefined ? (
                <div>
                  <dt>Each receives</dt>
                  <dd>
                    <Soso size={16}>{each}</Soso>
                  </dd>
                </div>
              ) : total !== undefined ? (
                <div>
                  <dt>SOSO rewards</dt>
                  <dd>
                    <Soso size={16}>{total}</Soso>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Claimed</dt>
                <dd>
                  {rewards.claimedCount}
                  <span className="kol-facts-of"> / {rewards.minted ?? KOLS.length}</span>
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        {/* The letters carry meaning now, so the row is announced as the word it
            spells rather than hidden outright. The individual glyphs stay out of
            the accessibility tree — read one at a time they are noise — and the
            portraits remain decorative. */}
        <div className="kol-stage" role="img" aria-label="KOL">
          {FEATURED.map((f) => (
            <div
              className="kol-plinth"
              key={f.file}
              style={{ ["--tint" as string]: f.tint, ["--shift" as string]: f.shift }}
            >
              <span className="kol-letter" aria-hidden="true">
                {f.letter}
              </span>
              <Image
                className="kol-figure"
                src={`/kols/${f.file}.webp`}
                alt=""
                width={760}
                height={760}
                priority
                sizes="(max-width: 760px) 30vw, 260px"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="roster">
        <div className="page">
          {rewards.deployed && stage !== "soon" ? <Yours rewards={rewards} stage={stage} /> : null}

          <div className="kol-grid">
            {KOLS.map((k) => (
              <article className={`kol-card${rewards.mine?.kol.n === k.n ? " is-mine" : ""}`} key={k.n}>
                <div className="kol-card-art">
                  <Art src={kolImage(k)} alt={k.name} sizes="(max-width: 700px) 45vw, 240px" />
                  {rewards.statuses.get(k.n)?.claimed ? (
                    <span className="chip chip-up kol-card-chip">Claimed</span>
                  ) : null}
                </div>
                <div className="kol-card-foot">
                  <b>{k.name}</b>
                  <span className="mono">#{k.n}</span>
                </div>
                {k.x === undefined ? null : (
                  <a
                    className="kol-card-x"
                    href={k.x}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${k.name} on X`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.8L18.9 2Zm-1.1 18.1h1.7L8.3 3.8H6.5l11.3 16.3Z" />
                    </svg>
                    {xHandle(k.x)}
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The connected wallet's own portrait, and the one button on this page.
 *
 * The person it is for arrives not knowing whether they are on the list, so
 * something shows while claiming is open. Not connected: an invitation to
 * check. Connected and not on it: one quiet line. On it: their portrait, large,
 * with what comes with it.
 */
function Yours({
  rewards,
  stage,
}: {
  rewards: ReturnType<typeof useKolRewards>;
  stage: Stage;
}) {
  const { isConnected } = useAccount();
  const { mine, tx, deadline } = rewards;

  if (!isConnected) {
    if (stage !== "open") return null;
    return (
      <div className="kol-invite">
        <p>
          <b>On the roster?</b> Connect the wallet you shared with us to claim your portrait.
        </p>
        <ConnectButton className="btn btn-primary">Connect wallet</ConnectButton>
      </div>
    );
  }

  if (rewards.loading) return null;

  if (mine === undefined) {
    if (stage !== "open") return null;
    return (
      <p className="kol-invite-note">
        No portrait is waiting for this wallet. On the roster? Connect the wallet you shared with us.
      </p>
    );
  }

  const { kol } = mine;
  // Their own reward — amounts differ per KOL. Zero means portrait only.
  const share = mine.amount > 0n ? formatSoso(mine.amount) : undefined;
  const claimed = mine.claimed || tx.success;

  return (
    <section className={`kol-yours${claimed ? " is-claimed" : ""}`} aria-labelledby="kol-yours-title">
      <div className="kol-yours-art">
        <Art src={kolImage(kol)} alt={kol.name} sizes="(max-width: 760px) 90vw, 420px" />
      </div>

      <div className="kol-yours-body">
        <p className="kol-yours-eyebrow">
          {claimed ? "In your wallet" : "Made for you"} · #{kol.n}
        </p>
        <h2 id="kol-yours-title" className="kol-yours-title">
          {claimed ? <>It&rsquo;s yours, {kol.name}.</> : <>GM, {kol.name}.</>}
        </h2>

        {claimed ? (
          <ClaimedActions kol={kol} portraits={rewards.portraits} />
        ) : stage === "preparing" ? (
          <p className="kol-yours-lede">
            Your portrait is set aside for this wallet. Claiming opens soon, so check back here.
          </p>
        ) : stage === "ended" ? (
          <p className="kol-yours-lede">
            Claiming closed{deadline === undefined ? "" : ` on ${day(deadline)}`}. Reach out to us and we will
            sort it out.
          </p>
        ) : (
          <>
            <p className="kol-yours-lede">
              One of one, drawn for you and nobody else
              {share === undefined ? "." : ", with SOSO alongside it, straight to this wallet."}
            </p>

            <ul className="kol-yours-gets">
              <li>
                <span>Portrait</span>
                <b>#{kol.n} · 1 of 1</b>
              </li>
              {share === undefined ? null : (
                <li>
                  <span>Reward</span>
                  <b>
                    <Soso size={16}>{share}</Soso>
                  </b>
                </li>
              )}
            </ul>

            <button
              type="button"
              className={`btn btn-primary btn-lg btn-block${tx.busy ? " is-busy" : ""}`}
              disabled={tx.busy}
              aria-busy={tx.busy}
              onClick={() => void rewards.claim(kol.n)}
            >
              {tx.signing ? "Confirm in your wallet…" : tx.confirming ? "Claiming…" : "Claim"}
            </button>
            <TxResult
              hash={tx.hash}
              confirming={tx.confirming}
              success={false}
              error={tx.error}
              successLabel="Claimed"
            />
            <p className="kol-yours-small">
              {deadline === undefined ? null : <>Open until {day(deadline)}. </>}
              Sponsored by ValueChain. You pay only a little gas.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/** After the claim: where it is, and a post to tell people about it. */
function ClaimedActions({ kol, portraits }: { kol: Kol; portraits: `0x${string}` | undefined }) {
  const text = "Just claimed my one-of-one portrait on ValueMint, made for the people who show up on SoDEX.";
  const intent =
    `https://x.com/intent/post?text=${encodeURIComponent(text)}` +
    `&url=${encodeURIComponent("https://www.valuemint.store/kols")}`;

  return (
    <>
      <p className="kol-yours-lede">Your portrait and your SOSO are in this wallet. Thank you for showing up.</p>
      <div className="kol-yours-actions">
        {portraits === undefined ? null : (
          <Link className="btn btn-primary" href={`/token/${portraits}/${kol.n}`}>
            View your portrait
          </Link>
        )}
        <a className="btn" href={intent} target="_blank" rel="noreferrer noopener">
          Share on X
        </a>
      </div>
    </>
  );
}
