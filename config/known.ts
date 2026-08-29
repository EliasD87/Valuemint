import { TRENCHES_ADDRESS } from "@/config/trenches";

/**
 * Collections the marketplace always lists, whoever deployed them.
 *
 * The mirror of `hidden.ts`. Collections normally arrive from two places: the
 * factory's registry, which knows anything created here instantly, and
 * Blockscout's token index, which knows any ERC-721 on the chain but is slow to
 * notice a new one and is a third party we do not control.
 *
 * A contract deployed straight from a script is in neither for a while. The
 * Trenches claim is exactly that — it is not a factory collection, because it
 * mints on a signature rather than a payment — so without this it would be
 * invisible on /collections and /market until the explorer caught up, even
 * though it is perfectly tradeable the moment the first piece is claimed.
 *
 * Entries are merged, not substituted: the live figures are still read from the
 * chain. An address here that is not yet deployed simply reads nothing back and
 * is dropped, so listing one before launch is harmless.
 */

export interface KnownCollection {
  address: `0x${string}`;
  name: string;
  symbol: string;
  /** Why it is here rather than arriving through the factory or the explorer. */
  reason: string;
}

export const KNOWN_COLLECTIONS: KnownCollection[] = [
  ...(TRENCHES_ADDRESS === ""
    ? []
    : [
        {
          address: TRENCHES_ADDRESS,
          name: "The Trenches",
          symbol: "TRENCH",
          reason:
            "Deployed directly rather than through the factory — it mints on a " +
            "signature, not a payment — so neither the registry nor the explorer " +
            "lists it promptly.",
        } satisfies KnownCollection,
      ]),
];
