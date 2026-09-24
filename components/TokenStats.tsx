"use client";

import { useMemo } from "react";
import { useBestListings, useOffersForToken } from "@/hooks/useSeaportOrders";
import { useActivity } from "@/hooks/useActivity";
import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { Soso } from "@/components/Soso";
import { formatSoso, formatCount } from "@/lib/format";
import type { TokenMetadata } from "@/lib/tokenMetadata";
import "./TokenStats.css";

/**
 * The four figures a buyer wants before deciding: what it is worth, what it
 * last went for, what the cheapest one costs, and how rare it is.
 *
 * ---
 *
 * **Every hook here is already mounted by the page around it.** The token page
 * reads the order book for its own price and the history for its last sale, and
 * React Query dedupes by key — so this strip is arithmetic over data already
 * in memory rather than a second pass.
 *
 * **Rarity costs nothing either, and that surprised me.** `/api/metadata`
 * composes a token's attributes from its collection's manifest, and one of them
 * is `Editions Minted` — the number of pieces sharing this design. Against the
 * collection's supply that is the share directly, with no trait index to build
 * and no walk over the collection. A contract from somewhere else publishes no
 * such attribute, so the cell is simply absent there, which is the honest
 * degradation: an unknown rarity must not read as a common one.
 */

/** Pulls a numeric attribute out of a token document, if it has one. */
function numericTrait(metadata: TokenMetadata | undefined, name: string): number | undefined {
  const found = metadata?.attributes?.find((a) => a.trait_type === name);
  if (found === undefined) return undefined;
  const n = Number(found.value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function Cell({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="ts-cell">
      <dt className="ts-label">{label}</dt>
      <dd className="ts-value">
        {children}
        {note === undefined ? null : <span className="ts-note">{note}</span>}
      </dd>
    </div>
  );
}

const Dash = () => <span className="ts-dash">&mdash;</span>;

export function TokenStats({
  collection,
  tokenId,
  metadata,
}: {
  collection: `0x${string}` | undefined;
  tokenId: bigint | undefined;
  metadata?: TokenMetadata;
}) {
  const { best: bestListings } = useBestListings(collection);
  const { best: bestOffer } = useOffersForToken(collection, tokenId);
  const { lastSale, logsUnavailable } = useActivity(collection, tokenId);
  const { supply } = useCollectionBasics(collection);

  /** The cheapest piece in the whole collection, not this one's price. */
  const floorWei = useMemo(() => {
    let floor: bigint | undefined;
    for (const order of bestListings.values()) {
      if (floor === undefined || order.priceWei < floor) floor = order.priceWei;
    }
    return floor;
  }, [bestListings]);

  /**
   * How many pieces share this one's design, and what share of the collection
   * that is.
   *
   * Guarded on a supply above zero: a collection whose every piece has been
   * burned reports 0 minted, and dividing by it prints `Infinity%` on a page
   * that is otherwise correct.
   */
  const minted = numericTrait(metadata, "Editions Minted");
  const rarity =
    minted === undefined || supply === undefined || (supply as bigint) <= 0n
      ? undefined
      : { minted, share: (minted / Number(supply)) * 100 };

  return (
    <dl className="ts-row" aria-label="Token figures">
      {/*
        Best offer and last sale are left out entirely until there is a figure
        to show. Most pieces have neither, and two dashed cells ahead of the
        floor were the first thing on the page telling a buyer nothing, while
        squeezing the one cell that did answer into "COLLECTION FL…".
      */}
      {bestOffer === undefined ? null : (
        <Cell label="Best offer">
          {/*
            WSOSO, and the unit is not decoration. This marketplace refuses
            native-currency bids outright, so a row saying "SOSO" would have
            somebody expecting the wrong balance to move.
          */}
          <Soso size={15} unit="WSOSO">
            {formatSoso(bestOffer.priceWei)}
          </Soso>
        </Cell>
      )}

      {/*
        Absent both when nothing has sold and when the history could not be
        read. Neither is a claim, and what matters is that NEITHER shows a price.
      */}
      {lastSale?.price === undefined || logsUnavailable ? null : (
        <Cell label="Last sale">
          <Soso size={15}>{formatSoso(lastSale.price)}</Soso>
        </Cell>
      )}

      <Cell label="Collection floor">
        {floorWei === undefined ? <Dash /> : <Soso size={15}>{formatSoso(floorWei)}</Soso>}
      </Cell>

      {/*
        Absent rather than dashed where the collection publishes no edition
        count. A dash in a rarity cell reads as "not rare"; an absent cell
        reads as "not known", and only the second is true of a contract that
        simply does not describe its designs.
      */}
      {rarity === undefined ? null : (
        <Cell label="Rarity" note={`${rarity.share.toFixed(1)}% of the collection`}>
          <span className="ts-plain">{formatCount(BigInt(rarity.minted))} share it</span>
        </Cell>
      )}
    </dl>
  );
}
