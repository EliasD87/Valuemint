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

  /**
   * The four below were reachable ONLY through the explorer's token index, and
   * that index went down.
   *
   * Measured against both factories: `isFromFactory` is false on each of them
   * for the current registry and the legacy one, so the explorer was the single
   * source telling the marketplace they exist. When its `/api/v2/tokens`
   * endpoint began timing out, /collections lost all four at once — including
   * ValueChain Genesis, which is our own.
   *
   * That is one third party's uptime deciding whether half the marketplace is
   * visible, for contracts whose addresses are fixed and known. They are named
   * here, and the explorer becomes what it should have been: a way to discover
   * collections nobody has named yet.
   *
   * Nothing is faked by listing them. Entries are merged with the chain, not
   * substituted for it — name, symbol, supply and everything else are still
   * read from the contract, so an address here that stopped existing simply
   * reads nothing back and drops out.
   */
  {
    address: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    name: "ValueChain Genesis",
    symbol: "VCG",
    reason:
      "Ours, and in neither factory registry — it predates them. It was only " +
      "ever listed because the explorer had indexed it.",
  },
  {
    address: "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
    name: "Cybereator",
    symbol: "CYBR",
    reason:
      "SoDEX's, deployed from their own wallet rather than through the " +
      "factory. Verified on the explorer as a proxy created by " +
      "0x888eB1Df1DB074cB50afb509a2aAce23895B86D9, the same wallet behind " +
      "their other two.",
  },
  {
    address: "0x412D8af16B7fF3FE75e1CD380BD86Ef33dD8AD0f",
    name: "TestCybereator",
    symbol: "TESTCYBR",
    reason:
      "SoDEX's test deployment of the same artwork, and the one most of the " +
      "traded pieces are today. Same deployer as Cybereator.",
  },
  {
    address: "0x761C3DD0f7a9282E9c5D108394EC7f3AB524A213",
    name: "TestSoDEXTreasureBox",
    symbol: "TESTSOBOX",
    reason:
      "SoDEX's treasure boxes. The test contract is the only one deployed so " +
      "far; add the real one here too when it ships.",
  },
];
