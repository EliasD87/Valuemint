import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

/**
 * Re-download the hero deck's artwork into public/hero/.
 *
 *   node scripts/refresh-hero.mjs
 *
 * The deck is a bundled snapshot rather than a live query, because building it
 * from chain data left the first thing anyone sees empty for 11.7 seconds - not
 * the artwork, which arrives in tens of milliseconds, but the hundred round
 * trips needed to decide which artwork. See config/heroDeck.ts.
 *
 * The cost of that is this file: when the collections on the front page change,
 * somebody has to run this. Nothing breaks if nobody does - the deck simply
 * shows the same five pieces - but it stops being a fair picture of the site.
 *
 * Sources are the IPFS URLs the live deck resolved to. If a collection's
 * artwork is re-pinned, update the CID here too.
 */

const DECK = [
  ["trenches", "https://ipfs.filebase.io/ipfs/QmaRw3gCPDSJ4cErcLf9V8bUUKckC5UP8kTF8jBrmcoyJ8"],
  ["larpers", "https://ipfs.filebase.io/ipfs/QmVDPjHpvRa4HMrGwBnZXEcBauRnCu1VZUPukuidRRdzzy"],
  [
    "genesis",
    "https://lavender-tiny-loon-904.mypinata.cloud/ipfs/bafybeie5wmsyytzkxmlu3dthfsr2gmrci2wy435ljnbqmlahkweqxnk3pu/03-stride.jpg",
  ],
  [
    "buddies",
    "https://lavender-tiny-loon-904.mypinata.cloud/ipfs/bafybeihg3dpj4nv7sse2favc35uzhoxfkigw6apo7myqbzmu4epj6yodpu/04-liquidity.jpg",
  ],
  [
    "hypno",
    "https://lavender-tiny-loon-904.mypinata.cloud/ipfs/bafybeidhlyon7y6j56d3q2upeou5nvm47nw63pkncjjg6f2mzzko6owgym/02-bubble-pop.jpg",
  ],
];

/**
 * 600px covers the ~300px the fan renders at on a 2x display. The originals are
 * sized for a full-bleed token page - one of them is 1.1 MB - and shipping
 * those into a thumbnail is most of what made the old deck heavy as well as
 * slow.
 */
const EDGE = 600;

await mkdir("public/hero", { recursive: true });

let before = 0;
let after = 0;

for (const [name, url] of DECK) {
  const res = await fetch(url, { signal: AbortSignal.timeout(40_000) });
  if (!res.ok) {
    console.log(`  ${name}: HTTP ${res.status} — kept the existing file`);
    continue;
  }
  const src = Buffer.from(await res.arrayBuffer());
  const out = await sharp(src).resize(EDGE, EDGE, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  await writeFile(`public/hero/${name}.webp`, out);

  before += src.length;
  after += out.length;
  console.log(`  ${name}.webp  ${Math.round(src.length / 1024)}KB -> ${Math.round(out.length / 1024)}KB`);
}

console.log(`\n  total ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`);
