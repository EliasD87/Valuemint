"use client";

import Link from "next/link";
import { DRAWS, type PerkDraw } from "@/config/draws";
import { TrenchesPerk } from "@/components/TrenchesPerk";
import "./HolderGiveaways.css";

/**
 * Holder giveaways on /trenches (owner, 2026-10-24: the Cybereator draw is
 * over and more giveaways for Trenches holders will follow).
 *
 * `GiveawaysPanel` sits in the hero beside the wallet's depth: past giveaways
 * as small rows that open their own page (/trenches/giveaways/<id>), and a
 * line that more are coming. `RunningGiveaway` shows a giveaway that is not
 * drawn yet in full under the hero, and nothing otherwise.
 */

/* A giveaway is finished once its seed is recorded (config/draws.ts `drawSeed`). */
const running = DRAWS.find((d) => d.drawSeed === undefined);
const past = DRAWS.filter((d) => d.drawSeed !== undefined);

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function RunningGiveaway() {
  return running === undefined ? null : <TrenchesPerk draw={running} />;
}

export function GiveawaysPanel() {
  return (
    <div className="card hg-panel" id="giveaways">
      <div className="hg-panel-top">
        <span className="eyebrow">Holder giveaways</span>
        <span className="hg-soon">{running === undefined ? "More coming" : "One running now"}</span>
      </div>
      {past.map((d) => (
        <GiveawayRow key={d.id} draw={d} />
      ))}
      <p className="hg-panel-note">More giveaways for Trenches holders are on the way.</p>
    </div>
  );
}

/** A finished giveaway: the prize, the result in a line, and the way to its page. */
function GiveawayRow({ draw }: { draw: PerkDraw }) {
  const sentCount = Object.keys(draw.sent).length;
  const allSent = draw.winners > 0 && sentCount >= draw.winners;
  return (
    <Link className="hg-row" href={`/trenches/giveaways/${draw.id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hg-row-art" src={draw.prizeImage} alt="" loading="lazy" />
      <span className="hg-row-body">
        <span className="hg-row-title">{draw.title}</span>
        <span className="hg-row-meta">
          Completed {dateText(draw.drawAt)} · {draw.winners} winners{allSent ? ", all sent" : ""}
        </span>
      </span>
      <svg className="hg-row-go" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
