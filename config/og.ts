/**
 * Collections that carry the OG tag beside their name.
 *
 * Like `config/verified.ts` and `config/tradingMark.ts`: addresses with a
 * reason, and the tag takes an address, so there is one place that decides
 * and the tooltip says why.
 *
 * "OG" is a claim about history, so the reason is one somebody can check.
 * Genesis is the oldest ERC-721 the explorer lists on ValueChain — created in
 * block 13,620,674, 28 Aug 2026, three weeks before the SoDEX boxes. It is NOT
 * the first token of any kind: the ERC-1155 "Trading Beasts" go back to June,
 * which is why this says ERC-721 and not "first NFT".
 */

export interface OgEntry {
  /** Shown as the tooltip and the accessible name. */
  reason: string;
}

const entries: Array<[string, OgEntry]> = [
  [
    "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    { reason: "OG — the first ERC-721 collection on ValueChain, deployed 28 Aug 2026" },
  ],
];

export const OG_COLLECTIONS: Record<string, OgEntry> = Object.fromEntries(
  entries.map(([address, entry]) => [address.toLowerCase(), entry]),
);

export function ogOf(address: string | undefined): OgEntry | undefined {
  return address === undefined ? undefined : OG_COLLECTIONS[address.toLowerCase()];
}
