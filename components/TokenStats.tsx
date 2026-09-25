"use client";

import { useMemo } from "react";
import { useBestListings, useOffersForToken } from "@/hooks/useSeaportOrders";
import { useActivity } from "@/hooks/useActivity";
import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { Soso } from "@/components/Soso";
import { formatSoso, formatCount } from "@/lib/format";
import { tierOf, type TokenMetadata } from "@/lib/tokenMetadata";
import { useFloors } from "@/hooks/useFloors";
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
   * This piece's own tier's floor, where it has a tier.
   *
   * The cell was "Collection floor" for every piece, and the collection floor
   * is the minimum across every tier — so a Super Rare Treasure Box showed the
   * cheapest Common's 8.98 beside it, the figure a buyer reads as "what this
   * goes for". Reported as a low trait's floor being used for the others. The
   * same rule as the cards and the portfolio (`floorForTier`): a tiered piece
   * is priced against its tier or not at all, and "none listed" is the true
   * answer when its tier has nothing for sale.
   */
  const tier = tierOf(metadata);
  const { tierRowsFor, isLoading: floorsLoading } = useFloors();
  const tierFloor =
    tier === undefined || collection === undefined
      ? undefined
      : tierRowsFor(collection).find((r) => r.tier === tier)?.price;

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

      {/*
        Nothing until the document is in. Before it, `tier` is undefined for
        EVERY piece, so this fell to the collection floor for the first second
        of every page — a Super Rare shown the Commons' price just as long as
        it takes to notice it.
      */}
      {metadata === undefined ? (
        <Cell label="Floor">
          <Dash />
        </Cell>
      ) : tier === undefined ? (
        <Cell label="Collection floor">
          {floorWei === undefined ? <Dash /> : <Soso size={15}>{formatSoso(floorWei)}</Soso>}
        </Cell>
      ) : (
        /* "none listed" is a claim, so it waits for the floors to have loaded:
           a tier with no row yet is unknown, not empty. */
        <Cell
          label={`${tier} floor`}
          {...(tierFloor === undefined && !floorsLoading ? { note: "none listed" } : {})}
        >
          {tierFloor === undefined ? <Dash /> : <Soso size={15}>{formatSoso(tierFloor)}</Soso>}
        </Cell>
      )}

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
