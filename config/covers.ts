/**
 * The pictures a collection is known by, named rather than discovered.
 *
 * ── EDIT THIS FILE TO CHANGE A COLLECTION'S THUMBNAILS ───────────────────
 *
 * Keys are collection addresses, lower-cased. Each value is up to four image
 * URLs, which is what a cover strip shows.
 *
 * -------------------------------------------------------------------------
 *
 * These used to be worked out: walk four tokens of every collection, read
 * `tokenByIndex`, `ownerOf` and `tokenURI` for each, fetch a metadata document
 * each, and collect the distinct images. Correct, and far too slow to put a
 * picture on screen — the collections rail rendered grey circles with initials
 * in them (`CY`, `HY`, `OC`) for as long as that took, on the first thing a
 * visitor sees.
 *
 * A collection's cover does not change from minute to minute, so nothing about
 * it needs to be derived at page load. Named here, the rail draws artwork on
 * the first paint with no chain read at all.
 *
 * A collection that is NOT listed here still works exactly as before: its cover
 * is assembled from its minted tokens once those reads land. This is a fast
 * path, not a gate — nothing disappears for want of an entry.
 */

/** Lower-cased address -> up to four image URLs. */
export const COLLECTION_COVERS: Record<string, string[]> = {
  // Cybereator — one animated GIF shared by every token.
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": [
    "https://gateway.pinata.cloud/ipfs/bafybeiexxwgg46ucafzx4fpesmobil45cwrspb34pefegnpzz5qux762p4",
  ],

  // TestCybereator — the same artwork, from the same file.
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": [
    "https://gateway.pinata.cloud/ipfs/bafybeiexxwgg46ucafzx4fpesmobil45cwrspb34pefegnpzz5qux762p4",
  ],

  // SoDEX Treasure Box — four tiers, four pictures, 5,000-odd tokens.
  "0x761c3dd0f7a9282e9c5d108394ec7f3ab524a213": [
    "https://gateway.pinata.cloud/ipfs/bafybeibltyk5zokqdookfnccsfcoebl3qzp4gkx45bhtgrllm2t23kp67u",
    "https://gateway.pinata.cloud/ipfs/bafybeif3cbqz2l5amcqk7yw4irrw2sjx6pwioxpcgu2cnjsaadadocvefa",
    "https://gateway.pinata.cloud/ipfs/bafybeih7427beihagqyxfnxwugn6p7gyxiekstpaps4qcsjaeumbuosc2u",
    "https://gateway.pinata.cloud/ipfs/bafybeihqcahgiep6s2ech2imswhn2azwylilhq2cvuvuzquyhs5xccrvmu",
  ],

  // ValueChain Genesis
  "0x5fadc59297e86acea20bff519aea0f9651cdc90b": [
    "https://ipfs.filebase.io/ipfs/QmYMTGjnRRdgf1VqhBMzwXjT81SAzSkGnXXRwkEX22YXj4",
    "https://ipfs.filebase.io/ipfs/QmaoM1sKhgYxjEyaF2H9BjZCjTNfwj4GK1AhvyvvrAoomM",
    "https://ipfs.filebase.io/ipfs/QmZUQTa5waSZCEqGiynkiTFyE9v9cgHEynP3BwwzuL4P4L",
    "https://ipfs.filebase.io/ipfs/QmPozrKy1o2TErRZBxrGe5zYBGeYPVi9jwevRoM1wFzYS9",
  ],

  // The Trenches — one picture per depth.
  "0xaab0dc8f2835ed903b35d2f52ff17c4bc92bec19": [
    "https://ipfs.filebase.io/ipfs/QmaRw3gCPDSJ4cErcLf9V8bUUKckC5UP8kTF8jBrmcoyJ8",
    "https://ipfs.filebase.io/ipfs/QmQUVQTkCcRB5GndhpEds3pu45FNK4Nfoc9AfX2zZ2qZr8",
    "https://ipfs.filebase.io/ipfs/QmcZrXvsX8FhSFD6y2U4JWpxq2pRZn5G475CNh8RzpvQPK",
    "https://ipfs.filebase.io/ipfs/QmZhR1M4Tmnu42Qgz5c5EcjCBJK7JVaTjgXuRNM2LfkiDq",
  ],

  // Hypno Plush
  "0x01c28095bfffc9973da4c4e8a34e9d5b6649c988": [
    "https://ipfs.filebase.io/ipfs/QmP62BaaW6qitRgGyzBBakn96MM3KQQL5LHXwy9e3mvm55",
    "https://ipfs.filebase.io/ipfs/QmbKZv4181zFxCF3kk3vNuKeVQxGPNQ61DiDBBuPGti1xv",
    "https://ipfs.filebase.io/ipfs/QmNhaU7rXWDqKaJrBK1v56tpT2URx7kypuoZoPTDMNWpAo",
    "https://ipfs.filebase.io/ipfs/QmfAcuavRQMgUZXk2KjGAgNh27NcgJpiSNgBYPs3QQV3bR",
  ],

  // Orange Companions
  "0xfe7b74f5dbaeea6a0ef0385f572d60083fefe0c0": [
    "https://ipfs.filebase.io/ipfs/QmbkHuFCw2ARHDTDzuqEJEnqUpRwZL9LsUyvYsk7yNehBT",
    "https://ipfs.filebase.io/ipfs/QmZAGyVAeh4HxEb9TrXSxciBCdNeiKfxaFu3g7tECgFvAd",
    "https://ipfs.filebase.io/ipfs/QmT2vsEYgXSGwAS7ZvWaLRuomcVr4scxiY4WUC36dyYhcb",
    "https://ipfs.filebase.io/ipfs/QmcFKu8PRy8gucXPqrzTKAkL6V7wz73cVBsLTjQH6HDzBr",
  ],

  // SoDex Larpers — one design across the edition.
  "0x0273df41b56e3480886fe8f0451349bec0f8edf6": [
    "https://ipfs.filebase.io/ipfs/QmVDPjHpvRa4HMrGwBnZXEcBauRnCu1VZUPukuidRRdzzy",
  ],

  // The Oracle
  "0xc486e7aa1c971a61c2a9c6b8ccf671acb0ffd064": [
    "https://ipfs.filebase.io/ipfs/QmR6DJr2KrZqkzQkcHCxHx956K9qaTnkjVvr9LmCu8etMs",
  ],
};

/** The named cover for a collection, or nothing if it has not been given one. */
export function coverFor(address: string): string[] | undefined {
  const named = COLLECTION_COVERS[address.toLowerCase()];
  return named !== undefined && named.length > 0 ? named : undefined;
}
