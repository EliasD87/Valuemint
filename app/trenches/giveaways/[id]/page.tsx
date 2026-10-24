import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DRAWS, drawById } from "@/config/draws";
import { GiveawayView } from "./GiveawayView";

/**
 * One Trenches holder giveaway on its own page (owner, 2026-10-24): its ticket,
 * the full list, the winners and the proof. /trenches keeps only a card for it
 * once it is drawn, so the page stays short as giveaways add up.
 *
 * Server shell for the metadata; the giveaway itself is drawn in the browser,
 * and only its id crosses over (the entry carries bigints).
 */

export function generateStaticParams() {
  return DRAWS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const draw = drawById((await params).id);
  if (draw === undefined) return { title: "Giveaway" };
  const title = `${draw.title} · The Trenches`;
  const description = `A ${draw.prize} giveaway for Trenches holders on ValueMint: the ticket list, the winners and the on-chain proof.`;
  return { title, description, openGraph: { title, description, type: "website" }, twitter: { card: "summary", title, description } };
}

export default async function GiveawayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (drawById(id) === undefined) notFound();
  return <GiveawayView id={id} />;
}
