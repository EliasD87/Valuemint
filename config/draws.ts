/**
 * Holder perks drawn among Trenches holders (2026-10-15).
 *
 * The first: Cybereator NFTs for the deepest traders in The Trenches. The
 * rules, all fixed before anyone can know the outcome:
 *
 *   - At the snapshot block, every Trenches piece of depth 5 or deeper is worth
 *     tickets equal to its depth (Inferno 5 ... Monolith 10). Pieces bought on
 *     the market count the same as pieces claimed: that is the point, it gives
 *     the deeper depths real value before the snapshot.
 *   - The owner takes part with one wallet; the test wallet and the deployer
 *     are left out, so nobody is in twice.
 *   - The list is published as /draws/<id>.json, every wallet with a fixed
 *     range of ticket numbers (contracts/scripts/draw-snapshot.mjs builds it
 *     from Transfer logs, so anyone can rebuild it).
 *   - The same list is uploaded to a TicketDraw contract and locked there
 *     together with `drawBlock`, a block that does not exist yet. The contract
 *     then picks the winners from that block's hash, on chain, exactly as
 *     lib/draw.ts does. One NFT per wallet.
 *   - The NFTs are sent by hand by the owner (2026-10-16); `sent` records each
 *     transfer (`STEP=sent` in contracts/scripts/ticket-draw.ts prints it).
 *
 * Block numbers are the rule; the dates beside them are estimates at the
 * chain's measured ~2.037s per block (20,000 and 100,000 blocks to 2026-10-18).
 */

export interface PerkDraw {
  id: string;
  /** What is given. */
  prize: string;
  /** The collection the prize comes from, for links. */
  prizeCollection: `0x${string}`;
  winners: number;
  /** Pieces of this depth or deeper count. */
  minDepth: number;
  snapshotBlock: bigint;
  /** Announced time of the snapshot, ISO, for display only. */
  snapshotAt: string;
  /** Small print under the snapshot step once it is taken, if anything about it needs saying. */
  snapshotNote?: string;
  drawBlock: bigint;
  drawAt: string;
  /**
   * The draw block's hash once the draw is done, copied from the contract. With
   * it the page shows the result at once instead of waiting on the chain; the
   * contract's own seed and winners are still read and compared.
   */
  drawSeed?: `0x${string}`;
  /**
   * False while the draw's time is still "Coming soon" on the page: no date,
   * no countdown, no block, and no result worked out from `drawBlock`.
   */
  drawAnnounced: boolean;
  /**
   * The TicketDraw contract holding the locked list (contracts/TicketDraw.sol),
   * or "" until it is deployed. Once set, the page takes the draw block, the
   * winner count and the winners from the chain, not from this file.
   */
  drawContract: `0x${string}` | "";
  /** Where the frozen ticket list is published, once it is. */
  listUrl: string;
  /** False until the list for `snapshotBlock` has been generated and published. */
  listPublished: boolean;
  /** Left out of the draw whatever they hold. Lower-case. */
  excluded: readonly string[];
  /** Lower-case winner wallet -> the transaction that sent its prize. */
  sent: Readonly<Record<string, `0x${string}`>>;
}

export const CYBEREATOR_SEATS: PerkDraw = {
  id: "cybereator-seats-1",
  prize: "Cybereator",
  prizeCollection: "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
  // Not public until the draw is announced (owner, 2026-10-15: do not say how
  // many). This file ships in the bundle and the repo is public, so the number
  // is set here only together with `drawAnnounced: true`.
  winners: 11,
  minDepth: 5,
  // Taken early (owner, 2026-10-18): SoDEX announced scheduled maintenance,
  // so the snapshot was taken at once instead of at 09:00 UTC. This is the
  // block the owner said "now" at, 12 deep when the list was built.
  snapshotBlock: 15_751_554n,
  snapshotAt: "2026-10-18T06:40:51Z",
  snapshotNote: "Snapshot taken earlier due to SoDEX maintenance",
  // Locked on chain 2026-10-18 (lock tx in block 15,752,044): 11 winners from
  // block 15,752,336's hash.
  drawBlock: 15_752_336n,
  drawAt: "2026-10-18T07:07:25Z",
  // Drawn in block 15,752,346 (tx 0xc4e1974f…b4ab); the contract's seed().
  drawSeed: "0x06cf2ab2570e6a487fb8795703d47ebdd4f3648bc4981617ec62ce1bde50868b",
  // "Coming soon" on the page (owner, 2026-10-15) until the draw is announced.
  drawAnnounced: true,
  drawContract: "0x31db41534Fb10438AFc3F691A172041de68af00D",
  listUrl: "/draws/cybereator-seats-1.json",
  listPublished: true,
  excluded: [
    // The owner's main wallet takes part (owner, 2026-10-15); these two do not,
    // so the owner is in the draw once.
    "0x36806932bc43047d0ce6363b8dec79c5d5a73136", // owner's test wallet
    "0xe2e4c5e48f514b06f907614b04d7a3f547ee815a", // deployer
    // 0x0879…BC84 is NOT here: it is the owner's main wallet and takes part
    // (owner, 2026-10-16: "stop excluding my wallet").
  ],
  // Sent by hand by the owner, Cybereator #327–#337 in place order (STEP=sent, 2026-10-18).
  sent: {
    "0xc9b1dd971573746dadb512aed37e954488c9e064": "0x30365797e85782af577b9dbad5226d02b417a9ac8a5fa41fecc941f9d9a8accb",
    "0x19f05bbb90281fcde3941729ce4c2af6d9d4e9c6": "0x006475485fd1e3fb854e036b117fd2e6179efe8892f0a28f182196ae5b119667",
    "0x86711fa179688c7266903a79a31fecd4964a4353": "0xb1a8a5f77b3baff8382f7c4b2b0c34c9d89e03cacfb1fa011d3134a8e73cf801",
    "0xa20e2797ef529911cf8a2b6432efe3dbc897fb3d": "0x6dddc954079a0be4d30e7257f325dd470a5b6bb30e423572a098da27b3d0518c",
    "0x19478dec6ddf64e2254607cb700cd4d39d075aa5": "0x080ceff100d517c83f38911f316dee93f9bc39c830d33c11a0e8812fdb0e85de",
    "0x4e60c1eca929166d4110a1094355afd70f9faa91": "0x1b94c43dbfd27e50f703fcc6d022679761974247947314d10553d86348fed961",
    "0xe11d242ffa7277bf7a50af1f334ce863d24e13dc": "0xcf3b5c1cbb816fef95d969697da2be41b1d42835954aecbb323476bdfa138c2e",
    "0x5d16c482895bc772b9f5371beca293584a32ecb4": "0x3adc3be5f96cc7e2a704cfd82477f778719027b7c04b18359c9d254ce2b7f5ee",
    "0x00745751d32b837c85ce713ef6dcaf1b7813825d": "0x7512853edd3e8d3cc4225f06ce998ef74b682d186972629dc5ca6a404ba0543c",
    "0xb8797b48c34372d734e552db09a82e204b226d72": "0x075cb22437f1de40c164f65f25bf6ea09baf3ff01b7b40cb9fa1202d12622de9",
    "0x6e59426c652c87060fc0378e1181a5013b0251fb": "0xcff58f2d00330855079b23f69cdf2ceffff39f713504206ba68974d7ee1e8001",
  },
};

/** Measured, not the nominal 2s: used only to estimate how long until a block. */
export const MEASURED_BLOCK_MS = 2_037;

/** Tickets one wallet holds for a list of piece depths. */
export function ticketsFor(depths: readonly number[], minDepth: number): number {
  return depths.reduce((sum, d) => (d >= minDepth ? sum + d : sum), 0);
}
