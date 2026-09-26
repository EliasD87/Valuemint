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
 * Token N carries entry N, so ids stay stable as the list grows. **Once the
 * collection is minted, only ever append.** Reordering or removing an entry
 * would silently repoint a token already in someone's wallet at a different
 * person's portrait.
 *
 * Renumbered 2026-09-26, before anything existed on chain (no KOLs collection
 * in either factory, checked): Keng Noor, Markinho, Stephen, Victor,
 * Farmercist and Takimi were removed, and bΞar, Kagurazaka Fortune, ただのいぬ
 * and ハルのナカミ added. The ids were closed up so the first mint —
 * `mintBatch` numbers tokens sequentially from 1 — lands each portrait on its
 * own id with no gaps.
 *
 * Renumbered again the same day, still before any mint: the roster grew to 30,
 * Victor and Farmercist came back with their original portraits, Elias was
 * removed, and everyone after #5 was shuffled at the owner's request — #1–5
 * keep their places.
 */

export interface Kol {
  /** Token id. Also this entry's position — append only, once minted. */
  n: number;
  /** The name they go by. */
  name: string;
  /** Filebase CID of the portrait. */
  image: string;
  /** Their X profile, where they gave one. */
  x?: string;
}

export const KOLS: Kol[] = [
  { n: 1, name: "BTCtensai", image: "QmWp59bT9RZi6qQozSZnfsoT2VC4z2744dZdQTGcGa83tz", x: "https://x.com/BTCtensai" },
  { n: 2, name: "CORTEZ", image: "QmPj319pEoPpg2NqP5ozvk2qxPoMDWjKPm2jMvnENAqi3K", x: "https://x.com/eyupyavuz75" },
  { n: 3, name: "LUTZ", image: "QmQ4LmfH4StkAmNLxHfmuz2CKbyJPqvRqiUWzLd2QjxUsC", x: "https://x.com/Lutz_S120" },
  { n: 4, name: "MICK", image: "QmZMufXR1z6QAFE83r9sRiqKBSsDPXhDLb8gFajvpuiHYV", x: "https://x.com/Mickssv" },
  { n: 5, name: "SKIDO", image: "QmRJoNdX43yLpTUMfxt77eCtvNs585Ra5wqcncoyMhnbyP", x: "https://x.com/MR_CRYPTO150" },
  { n: 6, name: "0xYeFz", image: "QmYdzZKnNZBvrQ7TKgheAcdXJRp3Yg8t5SYGpQ8v3DW1mM", x: "https://x.com/0xYefz" },
  { n: 7, name: "ROA", image: "QmbHpT3dG1PVbZzagoDUXcyVxKFVu8rbvrEkcRYcqNPVgr", x: "https://x.com/cryptoroabtc" },
  { n: 8, name: "VITALY", image: "QmTNkiWFbiEM1hLDHk6GjC6c7XhUyTGyhg64aQgxqvefkH", x: "https://x.com/vitalythm" },
  { n: 9, name: "bΞar", image: "QmQoHrQqt7vz4gD8ZUtB8RDSgw8RC92eg1ytMqHgDpFyod", x: "https://x.com/mato_3535" },
  { n: 10, name: "VICTOR", image: "QmZYgrPQiMB6pUHPGcVbaiLEKcet5yV1NeDp6iNpRkh2cS", x: "https://x.com/Victorerick001" },
  { n: 11, name: "Ralmix", image: "Qmc5UYEsvfcstnjDdsFYbVmijwEh62P1sgN68pfo2Dd6nC", x: "https://x.com/iRalmix" },
  { n: 12, name: "Kagurazaka Fortune", image: "QmXyTk8yrdp3cViAfxEQTFWpNa8yD5HNaeCgbQs5ov5mts", x: "https://x.com/KagurazakaF" },
  { n: 13, name: "Stylishtagnu", image: "QmTMpibq5CLWqqd7ZSMzZ1D7ZgkNhNYWY9EUNxqgXdP7wm", x: "https://x.com/stylishtagnu7" },
  { n: 14, name: "tomo&cipher", image: "QmVYfUZCmdrdcAmpDhJPWGLQ5CcQPyvZ3inCZ8KazWwF8g", x: "https://x.com/tomo81782224" },
  { n: 15, name: "Penny Yusuke", image: "QmWCtUTizse37y4Rz8E8NkKnQ2aQZjYGxpCVcdS1oMJsgx", x: "https://x.com/pennyyuusuke" },
  { n: 16, name: "HIBIKI", image: "QmXKT9AnRTut9dugb2yEmhQXRJyDKosBZ8zgYw1NhqH7xy", x: "https://x.com/whiskey_bonbon_" },
  { n: 17, name: "ただのいぬ", image: "QmTwQwMK8VfSjpdPAdpsYi5QpdJep8qr4jED6mNCT7HHza", x: "https://x.com/one_wan_inu" },
  { n: 18, name: "sasami", image: "QmW2dqPkPQRHUcvW5MmJkXiwCwYfFfMMoHxQtfxce4EWNh", x: "https://x.com/neko_smg" },
  { n: 19, name: "Tuğra", image: "QmbDWwLBcru5XqpbNvDHrHFxhax48gKTXrsVTKp99K4v4e", x: "https://x.com/xTugrakripto" },
  { n: 20, name: "Vault", image: "QmR3mn5oGzragL4EkMsJE3hp5soTPMX2DLLh61pUxeh6Si", x: "https://x.com/VaultSeek" },
  { n: 21, name: "ADEEN", image: "QmYDPNFr5QShbSjLf3xfKrHN1oSzpaXFsxth6CXf28AvCw", x: "https://x.com/devakin01" },
  { n: 22, name: "nyao", image: "QmTxxAe16zM79xeyqWhu9otGLXDSbxhS8AUP4GNJyzZrPM", x: "https://x.com/tomolamy0605" },
  { n: 23, name: "NFTrader-Crypto", image: "QmeQ23pxiPzEWuW1ZebqEqmBbYdz39KvRBNTrfQZeSwZp7", x: "https://x.com/NftraderCrypto" },
  { n: 24, name: "mikan", image: "QmdzdhKN4aapzJzGtmB1DTvA6xHQXiqsfQQVpZBJ66KwKH", x: "https://x.com/cryptermikan28" },
  { n: 25, name: "MARKINHO", image: "Qmdkz4kNgUmShMnaAE3oegwomQV45UgjUCka4qvJTEscZq", x: "https://x.com/markinho1970" },
  { n: 26, name: "MANJIROW", image: "QmQ95XtmmtVYVDcMw3aXzujpZU8DHxSEeppgHvniLhaMsv", x: "https://x.com/MANJIROW555" },
  { n: 27, name: "gennosuke", image: "QmeLfKX8iQg4aFL56cLVDq2fyJFRcaTehzFBgs1hHw8VNF", x: "https://x.com/gennosuke0123" },
  { n: 28, name: "Naya", image: "QmYKcLngR3dXB2544gu2HzUHELfHr9nAAtZsPPBsunzBeu", x: "https://x.com/Nayakaduarsa" },
  { n: 29, name: "Nori.ink", image: "QmZgVQXmaT8qmyrHFueRbGab6qkD69kiE6wa2kMiW2WA69", x: "https://x.com/coinborderless" },
  { n: 30, name: "ハルのナカミ", image: "QmS53hQv261bJehBbdT7f14Gnn5MvbGiTXmEzDAJew5B15", x: "https://x.com/yurusanaiinu" },
  { n: 31, name: "Ajeet Jhurawat", image: "QmXjkR4kjzUBAGBzutVLpRoY9eXzEsAExhMfTQTLV5VtNm", x: "https://x.com/ajeetjhurawat" },
  { n: 32, name: "Taka", image: "QmP5EfKGPFrLRHT1evuGMZ5XTzep8AsuPdRBtBWSr2DW1y", x: "https://x.com/taka_fit" },
  { n: 33, name: "FARMERCIST", image: "QmadRf1XfZRqUhHZe3NLDbJv7RTqaXC9wwv2Dch7mZNVyM", x: "https://x.com/Farmercist" },
  { n: 34, name: "Stephen", image: "QmVdG9ZbGHfNEkGe1QPqZfHBuJF7QduoUUoxQhBQiTLP3w", x: "https://x.com/Nightmare340" },
  { n: 35, name: "GOLD7 SoSoValue", image: "QmZPnZNFSEUtKa4sxX6kU6BvSXqZqQTwLAmALHPZrrJi77", x: "https://x.com/k03150825" },
  { n: 36, name: "El Turco", image: "Qmd9GmPeReh4SvvSioZbRoFZhUA7qvXWuH9b8ehtzatrQK", x: "https://x.com/birataturkcu88" },
  // Back 2026-09-26, after #1-36 were minted: appended, never inserted.
  { n: 37, name: "ELIAS", image: "Qmb7cBjWjstatn3QZXj1wfvBv23BtmttEPfJyAmWBBdNG7", x: "https://x.com/eliasing__" },
];

/** "https://x.com/VaultSeek" → "@VaultSeek". */
export const xHandle = (url: string) => `@${url.replace(/\/+$/, "").split("/").pop() ?? ""}`;

/** The live ValueMint KOLs collection (deployed 2026-09-26, owned by the Safe). */
export const KOLS_COLLECTION = "0x8a22d660611d0dc2051ab515da950dd9fcafbbbd";

/** The collection's slug, matching the metadata route and the contract baseURI. */
export const KOLS_SLUG = "valuemint-kols";

export const KOLS_GATEWAY = "https://ipfs.filebase.io/ipfs";

export const kolImage = (k: Kol) => `${KOLS_GATEWAY}/${k.image}`;

/** The entry a token id carries, or undefined if nothing is minted at that id. */
export function kolForToken(tokenId: number): Kol | undefined {
  return KOLS.find((k) => k.n === tokenId);
}

/**
 * The same portrait, mirrored onto our own origin.
 *
 * `kolImage` above is the canonical one and stays that way: it is what a
 * token's metadata resolves to, and it has to keep pointing at IPFS. This is
 * for /kols, which draws the whole roster at once inside a moving ribbon —
 * twelve gateway round trips in front of the one thing that page exists to
 * show, and a dropped connection leaves a hole in the middle of it.
 *
 * Generated by `metadata/scripts/localise-kols.mjs`, which reads this file. Add
 * an entry above, run it, and the mirror catches up.
 */
export const kolLocal = (k: Kol) => `/kols/roster/${String(k.n).padStart(2, "0")}.webp`;
