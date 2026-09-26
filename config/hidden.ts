/**
 * Collections the marketplace does not list.
 *
 * A deployed contract cannot be deleted, and the factory's registry is
 * append-only by design — a registry an owner could rewrite would be worth
 * very little. So "removing" a collection means this marketplace stops
 * *listing* it, which is the only honest thing a frontend can do.
 *
 * What that does and does not mean:
 *
 *   - Hidden everywhere collections are enumerated: the home page, /collections,
 *     /mint, /market and the portfolio grouping.
 *   - **Still reachable** at /collection/<address> and still fully functional on
 *     chain. Anyone holding one still owns it, and can still trade it. Pretending
 *     otherwise would be lying about state we do not control.
 *
 * Addresses are compared lowercased, so case here does not matter.
 */

export interface HiddenCollection {
  address: string;
  /** Why it is hidden — so a future reader can judge whether it still should be. */
  reason: string;
}

export const HIDDEN_COLLECTIONS: HiddenCollection[] = [
  {
    address: "0x38e8E2b3F51d87Bb1232e1a54EB54ddf9D54BbB3",
    reason:
      "KOL Claim Test (KOLTEST) — the rehearsal set for KolRewards, deployed " +
      "2026-09-26: 5 test NFTs claimed by throwaway test wallets. Not the real " +
      "KOL collection; see contracts/KOL-REWARDS-RUNBOOK.md.",
  },
  {
    address: "0xb16fA0aA3DaB0770E076480EAa8D3E8319eA3675",
    reason: "alpha (ALPH) — throwaway collection made while testing the create flow",
  },
  {
    address: "0x55fc6A7519c1b3dC07573cE1473fe0573D4CF716",
    reason: "vv (VVV) — throwaway collection made while testing the create flow",
  },
  {
    address: "0x745fdC92Def1F87E43d8053bB8079759e147ab7B",
    reason:
      "Elias Skills (ELIAS) — test collection, 2 minted, owned by the deployer. " +
      "Placeholder artwork, no listings.",
  },
  {
    address: "0x7F3Bffd816D9C26C3a10f5ba69ABD32724177688",
    reason:
      "Test Skills (SKILL) — test collection, 4 minted, owned by the deployer. " +
      "Placeholder artwork, no listings.",
  },
  {
    address: "0x5B19c316BFC7Ce001Eb844990dEfdF7BF102B4ef",
    reason:
      "Free Skills (FREE) — a third-party airdrop that arrived through the " +
      "explorer's token index rather than the factory, and sorted to the top of " +
      "the marketplace. Owned by 0x279814B5…15f5; 7 tokens across 7 wallets, " +
      "every one of them pointing at the same ipfs:// document, so it has one " +
      "picture and no per-token metadata. It implements none of the factory's " +
      "interface — no baseURI, mintPrice, maxSupply or publicMintEnabled — so " +
      "the mint and manage pages have nothing to show for it either. " +
      "Hidden from listings at the owner's request; still fully tradeable on " +
      "chain and still reachable at /collection/<address>.",
  },
  {
    address: "0xe1C322BC972f78E78cfac98f71aA986C65D9C3bD",
    reason:
      "Trade Buddies (BUDDY) — hidden at the owner's request. 107 of 1000 minted " +
      "and it is a first-party collection, so this is a choice about what the " +
      "front page leads with rather than a judgement about the collection. " +
      "Unhiding it is deleting these six lines.",
  },
  {
    address: "0xA99E205296A3354E5d42c0247C50dB06Ffd69750",
    reason:
      "testsample011 (TST011) — a throwaway made while testing the create flow, " +
      "the same as alpha and vv above. Deployed through the factory by " +
      "0x0879A87D…BC84, and totalSupply is 0: nothing was ever minted, so there " +
      "is no holder to inconvenience and nothing to trade. It is invisible to " +
      "the explorer's token index — an index only learns about a collection once " +
      "it has a token — and reached the marketplace through the factory registry, " +
      "which is why searching for it on the explorer finds nothing at all.",
  },
  /**
   * Trading Beasts, three times over.
   *
   * Three separate ERC-1155 contracts with the same name and the same symbol,
   * all deployed and owned by 0x36a2D7e0…35C6, none of them ours. Identical
   * names are exactly the case the Unverified badge exists for, and three rows
   * reading "Trading Beasts" with nothing to tell them apart is worse than
   * that: a buyer choosing between them has no way to know which one anybody
   * means, and two of the three are necessarily not the one they want.
   *
   * Hidden at the marketplace owner's request. As with everything in this file
   * that only affects what this frontend enumerates - all three remain live on
   * chain, still hold whatever they hold, and are still reachable directly at
   * /collection/<address>.
   */
  {
    address: "0x24267f7c4084e092D021A1db6626AA50adda28B3",
    reason: "Trading Beasts (BEAST) — one of three identically named ERC-1155s from 0x36a2D7e0…35C6.",
  },
  {
    address: "0x5506e870b0e6b776BB3bfcf8879ea96E538aDaBf",
    reason: "Trading Beasts (BEAST) — one of three identically named ERC-1155s from 0x36a2D7e0…35C6.",
  },
  {
    address: "0x698ECFbd5c0855810Ddb4385bA212D989107B011",
    reason: "Trading Beasts (BEAST) — one of three identically named ERC-1155s from 0x36a2D7e0…35C6.",
  },
  /**
   * SoDEX's two test deployments, retired 2026-09-21.
   *
   * Both carry the real collections' own artwork on throwaway contracts, and
   * until today they were listed for an honest reason: they are where nearly
   * all the trading actually happened — 9,623 test boxes against the real
   * contract's one, and 2,474 test Cybereators besides. On a
   * marketplace whose default sort is activity that is decisive, and /market
   * put both of them above the collections they were testing.
   *
   * `PINNED_COLLECTIONS` was written for exactly this and could not reach it,
   * because no ranking knows which of two identical-looking contracts is the
   * one that counts. That is a decision, so it is written down here instead.
   *
   * As with everything in this file, both stay live on chain, stay tradeable,
   * and stay reachable at /collection/<address> — which is why `covers.ts`
   * and `wordmarks.ts` keep their entries for these two addresses. Remove
   * those and the pages their holders can still reach go blank.
   */
  {
    address: "0x412D8af16B7fF3FE75e1CD380BD86Ef33dD8AD0f",
    reason:
      "TestCybereator (TESTCYBR) — SoDEX's test deployment of Cybereator's " +
      "artwork, retired in favour of the real contract at 0xCD30D4bC…8D30.",
  },
  {
    address: "0x761C3DD0f7a9282E9c5D108394EC7f3AB524A213",
    reason:
      "TestSoDEXTreasureBox (TESTSOBOX) — SoDEX's test boxes, 9,623 of them, " +
      "retired in favour of the real contract at 0x371c4F7F…E750.",
  },
];

/**
 * Additional addresses from the environment, comma separated.
 *
 * The list above is compiled into the bundle, so adding to it means editing
 * code, opening a pull request and waiting for a deploy. That is an acceptable
 * pace for tidying away two test collections and far too slow for the reason
 * this list will actually be needed: the marketplace indexes every ERC-721 on
 * the chain, so an impersonation, a scam or an illegal image appears here by
 * itself and has to be able to disappear in minutes.
 *
 * `NEXT_PUBLIC_` because the check runs in the browser, where the list is
 * enumerable anyway — every address in it is public on chain by definition, so
 * there is nothing here to keep secret.
 *
 * Changing it on Vercel is a redeploy of the same build, not a code change.
 */
const fromEnv = (process.env.NEXT_PUBLIC_HIDDEN_COLLECTIONS ?? "")
  .split(",")
  .map((a) => a.trim().toLowerCase())
  .filter((a) => /^0x[0-9a-f]{40}$/.test(a));

const hidden = new Set([
  ...HIDDEN_COLLECTIONS.map((c) => c.address.toLowerCase()),
  ...fromEnv,
]);

export function isHidden(address: string): boolean {
  return hidden.has(address.toLowerCase());
}

/** How many addresses are suppressed, and how many came from the environment. */
export const hiddenCount = { total: hidden.size, fromEnv: fromEnv.length };
