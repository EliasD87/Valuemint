"use client";

import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { isDisplayable } from "@/lib/traitRoles";
import type { TokenMetadata } from "@/lib/tokenMetadata";
import "./TokenTraits.css";

/**
 * What a piece is made of.
 *
 * ---
 *
 * **Some attributes are bookkeeping, not traits.**
 *
 * `/api/metadata` composes a token document from its collection's manifest and
 * includes fields the rest of the app needs: `Editions Minted` is what the
 * rarity figure is computed from, and `Design Number` is the index into the
 * manifest. Neither is something a collector reads about a piece, and
 * `Editions Minted` is now shown twice — once here and once as the Rarity cell
 * above, which is the worse of the two problems. They are filtered out.
 *
 * The list is in `lib/traitRoles.ts` and is shared with the collection page's
 * filter row, which had no notion of any of this and was offering a dropdown
 * for every attribute a token carried.
 *
 * ---
 *
 * **A share is shown only where the collection published a count.** Our own
 * collections describe their designs, so a design's rarity is known exactly.
 * A contract from somewhere else publishes traits with no counts at all, and
 * those render as plain values — an unknown share must not read as a common
 * one, so there is nothing where there is nothing.
 */

export function TokenTraits({
  collection,
  metadata,
}: {
  collection: `0x${string}` | undefined;
  metadata?: TokenMetadata;
}) {
  const { supply } = useCollectionBasics(collection);

  const traits = (metadata?.attributes ?? []).filter((a) => isDisplayable(a.trait_type));

  if (traits.length === 0) return null;

  /**
   * How many pieces share this one's design — the same figure the Rarity cell
   * uses, and the only count any of our manifests publish. It is attached to
   * the Design trait alone, because that is the trait it describes: putting it
   * on "Edition" would claim that 10 pieces share edition #1, which is false.
   */
  const mintedRaw = metadata?.attributes?.find(
    (a) => String(a.trait_type).toLowerCase() === "editions minted",
  )?.value;
  const minted = Number(mintedRaw);
  const total = supply === undefined ? 0 : Number(supply);
  const share =
    Number.isFinite(minted) && minted > 0 && total > 0 ? (minted / total) * 100 : undefined;

  return (
    <section className="tt">
      <p className="eyebrow">Traits</p>

      <dl className="tt-grid">
        {traits.map((a) => {
          const isDesign = String(a.trait_type).toLowerCase() === "design";
          return (
            <div key={a.trait_type} className="tt-card">
              <dt className="tt-type">{a.trait_type}</dt>
              <dd className="tt-value">
                <span className="tt-val">{String(a.value)}</span>
                {isDesign && share !== undefined ? (
                  <span className="tt-share">
                    {minted.toLocaleString()} &middot; {share.toFixed(1)}%
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
