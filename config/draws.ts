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
  winners: 0,
  minDepth: 5,
  // Taken early (owner, 2026-10-18): SoDEX announced scheduled maintenance,
  // so the snapshot was taken at once instead of at 09:00 UTC. This is the
  // block the owner said "now" at, 12 deep when the list was built.
  snapshotBlock: 15_751_554n,
  snapshotAt: "2026-10-18T06:40:51Z",
  snapshotNote: "Snapshot taken earlier due to SoDEX maintenance",
  drawBlock: 15_757_418n,
  drawAt: "2026-10-18T10:00:00Z",
  // "Coming soon" on the page (owner, 2026-10-15) until the draw is announced.
  drawAnnounced: false,
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
  sent: {},
};

/** Measured, not the nominal 2s: used only to estimate how long until a block. */
export const MEASURED_BLOCK_MS = 2_037;

/** Tickets one wallet holds for a list of piece depths. */
export function ticketsFor(depths: readonly number[], minDepth: number): number {
  return depths.reduce((sum, d) => (d >= minDepth ? sum + d : sum), 0);
}
