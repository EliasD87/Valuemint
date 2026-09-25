"use client";

import { useReadContracts } from "wagmi";
import { heldBackFor } from "@/config/reveal";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { revealDay, revealLong, revealPending } from "@/lib/unrevealed";
import "./Unrevealed.css";

/** A padlock, for anything sealed. Inherits the text colour. */
export function SealIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      className="seal-icon"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M8 1.5a3.5 3.5 0 0 0-3.5 3.5v2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 7h-.5V5A3.5 3.5 0 0 0 8 1.5Zm2 5.5H6V5a2 2 0 1 1 4 0v2Z"
      />
    </svg>
  );
}

/**
 * The line above a collection's grid while part of it is sealed.
 *
 * **It exists because a grid of identical mystery helmets reads as broken.**
 * The title says the blank is deliberate and when it ends; the odds say what
 * is inside. The second line is an invitation rather than an explanation — the
 * owner cut a sentence about the commitment as more than anyone needed, and
 * the proof link still carries it for whoever wants it.
 *
 * **The invitation is only made while it can be accepted.** It reads the
 * contract: public minting enabled and pieces left. Closed or sold out, the
 * line and the button simply are not there, rather than sending somebody to a
 * mint panel that is not rendered.
 *
 * Retires itself after the reveal day. The cards stop claiming a reveal the
 * moment their documents name a design; this has no document to watch, so it
 * watches the date.
 */
export function SealedNotice({ collection }: { collection: `0x${string}` | undefined }) {
  const held = heldBackFor(collection);
  const pending = held !== undefined && revealPending(held);

  const { data } = useReadContracts({
    contracts:
      collection === undefined
        ? []
        : [
            { address: collection, abi: ValueChainCollectionAbi, functionName: "publicMintEnabled" },
            { address: collection, abi: ValueChainCollectionAbi, functionName: "publicMintRemaining" },
          ],
    query: { enabled: collection !== undefined && pending, refetchInterval: 30_000 },
  });

  if (held === undefined || !pending) return null;

  const open = data?.[0]?.status === "success" && data[0].result === true;
  const left = data?.[1]?.status === "success" ? Number(data[1].result as bigint) : undefined;
  const canMint = open && left !== undefined && left > 0;
  const day = revealDay(held);

  return (
    <aside className="ur-notice" aria-labelledby="ur-notice-title">
      <span className="ur-notice-icon">
        <SealIcon size={16} />
      </span>
      <div className="ur-notice-text">
        <p className="ur-notice-title" id="ur-notice-title">
          {held.count} pieces are sealed, revealed {revealLong(held)}
        </p>
        {canMint ? (
          <p className="ur-notice-lead">
            Mint {day === undefined ? "now" : `before ${day}`} to be part of the reveal ·{" "}
            <strong>{left} left</strong>
          </p>
        ) : null}
      </div>
      <ul className="ur-pot" aria-label="What the sealed pieces hold">
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
        Proof ↗
      </a>
      {canMint ? (
        <a className="btn btn-sm btn-primary ur-notice-cta" href="#mint">
          Mint
        </a>
      ) : null}
    </aside>
  );
}

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
