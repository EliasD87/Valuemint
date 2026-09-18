"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { Activity } from "@/components/Activity";
import { MyTrades } from "@/components/MyTrades";
import "@/styles/activity.css";

/**
 * The full history, for when ten rows are not enough.
 *
 * The panels on a token, a collection and the portfolio each show the ten most
 * recent events and link here. That split is the point: a panel is a glance and
 * a page is a record, and trying to be both is what produced a forty-row table
 * halfway down a token page that nobody read and that pushed the offers out of
 * sight.
 *
 * One route rather than three. Collection history, token history and a wallet's
 * own trades are the same rows filtered differently, they share one cached scan,
 * and three pages would have been three copies of this file.
 *
 *   /activity                        everything on the marketplace
 *   /activity?collection=0x…         one collection
 *   /activity?collection=0x…&token=7 one piece
 *   /activity?wallet=me              your own trades
 */
export default function ActivityPage() {
  return (
    // `useSearchParams` needs a Suspense boundary to prerender, and without one
    // the whole route opts into dynamic rendering.
    <Suspense fallback={<section className="page section" />}>
      <ActivityView />
    </Suspense>
  );
}

function ActivityView() {
  const params = useSearchParams();
  const { address } = useAccount();

  const raw = params.get("collection") ?? "";
  const collection = /^0x[0-9a-fA-F]{40}$/.test(raw) ? (raw as `0x${string}`) : undefined;

  const rawToken = params.get("token") ?? "";
  const tokenId = (() => {
    if (!/^[0-9]+$/.test(rawToken)) return undefined;
    try {
      return BigInt(rawToken);
    } catch {
      return undefined;
    }
  })();

  const wallet = params.get("wallet") === "me";

  const heading = wallet
    ? "Your trades"
    : tokenId !== undefined
      ? `Token #${tokenId.toString()}`
      : collection !== undefined
        ? "Collection activity"
        : "Everything that has traded";

  /** Back to whatever this history is about, rather than always to the market. */
  const back =
    tokenId !== undefined && collection !== undefined
      ? { href: `/token/${collection}/${tokenId}`, label: "Back to the piece" }
      : collection !== undefined
        ? { href: `/collection/${collection}`, label: "Back to the collection" }
        : wallet
          ? { href: "/portfolio", label: "Back to your portfolio" }
          : { href: "/market", label: "Back to the market" };

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Activity</p>
          <h2>{heading}</h2>
        </div>
        <Link className="head-link" href={back.href}>
          {back.label} &rarr;
        </Link>
      </div>

      {/* "Full history" rather than the heading again: the h2 above already
          says whose history this is, and a panel titled the same thing twelve
          pixels under it is just noise. */}
      {wallet && address === undefined ? (
        <p className="act-note">Connect a wallet to see what it has traded.</p>
      ) : wallet ? (
        <MyTrades address={address} title="Full history" full />
      ) : (
        <Activity collection={collection} tokenId={tokenId} title="Full history" full />
      )}
    </section>
  );
}
