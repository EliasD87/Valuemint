/**
 * The KOL portraits — one of one each, given out rather than sold.
 *
 * ## Why this is a list and not a pinned manifest
 *
 * Every other collection here describes itself in a single manifest pinned at
 * creation, because its designs are fixed the moment it exists. This set is
 * not fixed: it grows whenever another SoDEX regular is worth adding, and a
 * manifest would have to be re-pinned and the contract's `baseURI` repointed
 * every time — changing the metadata URL of every token already minted.
 *
 * Kept here instead, adding someone is: pin one image, add one line below,
 * deploy, mint. Nothing already in a wallet is touched.
 *
 * ## Token id is the index
 *
 * Token N carries entry N, so ids stay stable as the list grows. **Only ever
 * append.** Reordering or removing an entry would silently repoint a token
 * that is already in someone's wallet at a different person's portrait.
 */

export interface Kol {
  /** Token id. Also this entry's position — append only. */
  n: number;
  /** The name they go by. */
  name: string;
  /** Filebase CID of the portrait. */
  image: string;
}

export const KOLS: Kol[] = [
  { n: 1, name: "BTCtensai", image: "QmWp59bT9RZi6qQozSZnfsoT2VC4z2744dZdQTGcGa83tz" },
  { n: 2, name: "CORTEZ", image: "QmPj319pEoPpg2NqP5ozvk2qxPoMDWjKPm2jMvnENAqi3K" },
  { n: 3, name: "ELIAS", image: "Qmb7cBjWjstatn3QZXj1wfvBv23BtmttEPfJyAmWBBdNG7" },
  { n: 4, name: "FARMERCIST", image: "QmadRf1XfZRqUhHZe3NLDbJv7RTqaXC9wwv2Dch7mZNVyM" },
  { n: 5, name: "KENG NOOR", image: "QmQjpADdjRv1YtY4UrHYNAWZ9gJsUodgC4Zg5SVkp19YSH" },
  { n: 6, name: "LUTZ", image: "QmQ4LmfH4StkAmNLxHfmuz2CKbyJPqvRqiUWzLd2QjxUsC" },
  { n: 7, name: "MARKINHO", image: "Qmdkz4kNgUmShMnaAE3oegwomQV45UgjUCka4qvJTEscZq" },
  { n: 8, name: "MICK", image: "QmZMufXR1z6QAFE83r9sRiqKBSsDPXhDLb8gFajvpuiHYV" },
  { n: 9, name: "SKIDO", image: "QmRJoNdX43yLpTUMfxt77eCtvNs585Ra5wqcncoyMhnbyP" },
  { n: 10, name: "TAKIMI", image: "QmdMQBwzSru7WyeaJJbTX8a1yw8rA6mX69TBTtVc2rJFAa" },
  { n: 11, name: "VICTOR", image: "QmZYgrPQiMB6pUHPGcVbaiLEKcet5yV1NeDp6iNpRkh2cS" },
  { n: 12, name: "VITALY", image: "QmTRUUobkZ8VCjtdh1Tby3gwt4tu7UJ6YYCS6jTx3Ac2G6" },
];

/** The collection's slug, matching the metadata route and the contract baseURI. */
export const KOLS_SLUG = "valuemint-kols";

export const KOLS_GATEWAY = "https://ipfs.filebase.io/ipfs";

export const kolImage = (k: Kol) => `${KOLS_GATEWAY}/${k.image}`;

/** The entry a token id carries, or undefined if nothing is minted at that id. */
export function kolForToken(tokenId: number): Kol | undefined {
  return KOLS.find((k) => k.n === tokenId);
}
