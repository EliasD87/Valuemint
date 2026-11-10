/**
 * Cybereator's reveal, as its team specified it to ValueMint (2026-11-10,
 * "CybeReator 开盒接入说明"). Everything the site needs to know about the
 * reveal lives here, so the rules are in one place and testable.
 *
 * In short: holders open their pieces on cybereator.com from 10 November,
 * 12:00 UTC. The NFT contract is unchanged; a separate opener contract records
 * each opening. A token's metadata moves from SoDEX's gateway to
 * `https://cybereator.com/metadata/{id}`, and while it carries a `Status`
 * trait (Unopened, Opening, Rendering) it can still change. Once `Status` is
 * gone the metadata and image are final and never change again.
 */

/** The NFT contract. Unchanged by the reveal. */
export const CYBEREATOR = "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30";

/** CybereatorOpener: records which token opened in which block. Moves nothing. */
export const CYBEREATOR_OPENER = "0x8f26671664ad6940df88e70f77a6d24b20c79a15";

/**
 * SealedOnlyZone (contracts/contracts/SealedOnlyZone.sol): the guard behind
 * "Unopened" offers. Seaport asks it at the moment of sale, and it refuses any
 * fill that delivers a piece the opener reports as opened. No owner, no admin.
 *
 * Deployed 2026-11-10, block 16,739,211 (contracts/scripts/deploy-sealed-zone.ts),
 * bytecode checked against the tested build;
 * the site offers "Unopened" only once this is set, lower-case.
 */
export const CYBEREATOR_SEALED_ZONE: `0x${string}` | undefined = "0x96c865b0ce2c0419ecdb0e572cd221f939fe80b1";

/**
 * Cybereator's image CDN (Cloudflare in front of the bucket below), sent by the
 * team on 2026-11-10. Same paths, same files, a year's cache: measured from
 * Addis Ababa at 0.4 s for a 1.3 MB PNG once warm, against 2-10 s from Tokyo.
 */
export const CYBEREATOR_IMAGE_HOST = "cyber-static.cybereator.com";

/** Where every image lives (Alibaba Cloud OSS, Tokyo), and what the metadata still names. */
export const CYBEREATOR_ORIGIN_HOST = "cybereator.oss-ap-northeast-1.aliyuncs.com";

const ORIGIN_PREFIX = `https://${CYBEREATOR_ORIGIN_HOST}/`;

/**
 * The same image from the CDN. Metadata, the gallery and older cached
 * documents name the bucket; every path there is served unchanged by the CDN.
 * Anything else is returned as it came.
 */
export function cybereatorCdn(url: string): string;
export function cybereatorCdn(url: string | undefined): string | undefined;
export function cybereatorCdn(url: string | undefined): string | undefined {
  return url?.startsWith(ORIGIN_PREFIX) ? `https://${CYBEREATOR_IMAGE_HOST}/${url.slice(ORIGIN_PREFIX.length)}` : url;
}

/** The sealed picture after the move: the same 6.6 MB GIF as SoDEX's IPFS copy, at either address. */
export const CYBEREATOR_UNOPENED_GIF = `https://${CYBEREATOR_IMAGE_HOST}/images/unopened-v5.gif`;
export const CYBEREATOR_UNOPENED_GIF_ORIGIN = `${ORIGIN_PREFIX}images/unopened-v5.gif`;

/** Event topics the team named for refreshes (the contracts do not implement ERC-4906). */
export const CYBEREATOR_TOPICS = {
  /** Opened(uint256 indexed tokenId, address indexed owner, uint256 openBlock, uint256 openIndex, uint256 epoch) */
  opened: "0xe46dd771cbb2a7bc2ee3f904902dfb1ce4c9cf03961b9fa7e25c9e3934c0deab",
  /** Revealed(uint256 indexed tokenId, bytes32 seed) */
  revealed: "0x7d69e344e8948ee2d0ae2411f140ed9d811e9281db0368d2f77a802d9d8346f5",
  /** BaseURIUpdated(string oldURI, string newURI), on the NFT contract */
  baseUriUpdated: "0x309b29ded109b9e28fb9885757b3e0096eb75c51d23aa4635d68bcd569f6adc1",
} as const;

/**
 * A Cybereator metadata URL for this token id, on either host: SoDEX's gateway
 * (until the switch) or cybereator.com (after). Anchored, so `/cybr/12` never
 * matches token 123.
 */
export function cybereatorDocPattern(id: bigint | string): RegExp {
  return new RegExp(
    `https://(?:mainnet-gw\\.sodex\\.dev/api/v1/nft/token/cybr|cybereator\\.com/metadata)/${String(id)}(?![0-9])`,
  );
}

/** Any Cybereator metadata URL, on either host. */
export const CYBEREATOR_DOC = /https:\/\/(?:mainnet-gw\.sodex\.dev\/api\/v1\/nft\/token\/cybr|cybereator\.com\/metadata)\/[0-9]+/;

/** Whether a document URL is one of cybereator.com's, whose cacheability depends on its body. */
export function isCybereatorDoc(url: string): boolean {
  return /^https:\/\/cybereator\.com\/metadata\/[0-9]+\/?$/.test(url);
}

/**
 * The document's `Status` trait, if it has one: "Unopened", "Opening" or
 * "Rendering". Undefined means the piece is revealed and final.
 */
export function cybereatorStatus(doc: unknown): string | undefined {
  const attributes = (doc as { attributes?: unknown } | null | undefined)?.attributes;
  if (!Array.isArray(attributes)) return undefined;
  for (const a of attributes as Array<{ trait_type?: unknown; value?: unknown }>) {
    if (typeof a?.trait_type === "string" && a.trait_type.toLowerCase() === "status") {
      return typeof a.value === "string" ? a.value : String(a.value ?? "");
    }
  }
  return undefined;
}

/**
 * The 512×512 WebP thumbnail for a revealed piece's 2048×2048 PNG, which the
 * team asked list pages to use. Undefined for anything that is not one.
 */
export function cybereatorThumb(image: string | undefined): string | undefined {
  if (image === undefined) return undefined;
  const m = /^https:\/\/(?:cybereator\.oss-ap-northeast-1\.aliyuncs\.com|cyber-static\.cybereator\.com)\/(286623\/0x[0-9a-fA-F]{40})\/images\/([0-9]+)\.png$/.exec(image);
  return m === null ? undefined : `https://${CYBEREATOR_IMAGE_HOST}/${m[1]}/thumbs/${m[2]}.webp`;
}
