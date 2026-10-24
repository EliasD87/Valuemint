"use client";

import Link from "next/link";
import { drawById } from "@/config/draws";
import { TrenchesPerk } from "@/components/TrenchesPerk";
import "@/styles/home.css";
import "@/styles/trenches.css";

/** The giveaway, under a way back to /trenches. */
export function GiveawayView({ id }: { id: string }) {
  const draw = drawById(id);
  if (draw === undefined) return null;
  return (
    <>
      <nav className="page trx-back" aria-label="Breadcrumb">
        <Link href="/trenches#giveaways">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
          The Trenches · Holder giveaways
        </Link>
      </nav>
      <TrenchesPerk draw={draw} />
    </>
  );
}
