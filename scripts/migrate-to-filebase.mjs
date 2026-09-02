import { readFile, writeFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";

/**
 * Move Genesis and Hypno Plush artwork off Pinata and onto Filebase.
 *
 *   node scripts/migrate-to-filebase.mjs          # dry run, pins nothing
 *   node scripts/migrate-to-filebase.mjs --pin    # actually uploads
 *
 * Why: Pinata's dedicated gateway has exhausted its free request allowance and
 * answers 403 for every path. Both collections carry that host inside their
 * on-chain `baseURI`, so their metadata documents - not just their images - are
 * unreachable without the client-side rewrite currently papering over it.
 *
 * What this produces is a v2 manifest per collection: one CID per image, which
 * is what Filebase's S3 API gives (it addresses objects individually and
 * returns no directory CID, so v1's shared-directory form is not available).
 * The manifest is itself pinned, and `/api/metadata/<manifestCid>/<id>` then
 * generates every token document from it.
 *
 * THE THING THAT MUST NOT CHANGE
 *
 * Which design each token depicts. People own these. `assignDesigns` is a
 * seeded Fisher-Yates shuffle over a deck built from the per-design counts, so
 * feeding it the original designs and seed reproduces the original mapping
 * exactly - and this script refuses to emit a manifest until it has checked
 * that, token by token, against the assignments recorded when the collection
 * was first generated.
 *
 * Finishing this migration needs one `setBaseURI` transaction per collection,
 * which only the collection owner can send. This script does not touch the
 * chain; it prints the calls to make.
 */

const PIN = process.argv.includes("--pin");
const ROOT = path.resolve("..");

// --- credentials ------------------------------------------------------------

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const KEY = env.FILEBASE_KEY;
const SECRET = env.FILEBASE_SECRET;
const BUCKET = env.FILEBASE_BUCKET;
if (PIN && (!KEY || !SECRET || !BUCKET)) {
  throw new Error("FILEBASE_KEY, FILEBASE_SECRET and FILEBASE_BUCKET must be set in web/.env.local");
}

// --- minimal SigV4 PUT against Filebase's S3 endpoint -----------------------

const HOST = "s3.filebase.com";
const REGION = "us-east-1";

function sha256(b) {
  return createHash("sha256").update(b).digest("hex");
}
function hmac(k, d) {
  return createHmac("sha256", k).update(d).digest();
}

async function putObject(key, body, contentType) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${HOST}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    `/${BUCKET}/${key}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(
    hmac(hmac(hmac(hmac(`AWS4${SECRET}`, dateStamp), REGION), "s3"), "aws4_request"),
    toSign,
  ).toString("hex");

  const res = await fetch(`https://${HOST}/${BUCKET}/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${KEY}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Filebase rejected ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);

  const cid = res.headers.get("x-amz-meta-cid");
  if (!cid) throw new Error(`Filebase stored ${key} but returned no CID — is the bucket on the IPFS network?`);
  return cid;
}

// --- the assignment, reproduced exactly -------------------------------------

/** Mirrors lib/buildMetadata.ts. Duplicated so a change there cannot silently reshuffle a live collection. */
function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assignDesigns(designs, seed) {
  const deck = designs.flatMap((d) => Array.from({ length: d.count }, () => d));
  const random = seededRandom(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const seen = new Map();
  return deck.map((design) => {
    const edition = (seen.get(design.name) ?? 0) + 1;
    seen.set(design.name, edition);
    return { design, edition };
  });
}

// --- what to migrate --------------------------------------------------------

const { DESIGNS, SHUFFLE_SEED, COLLECTION } = await import(
  `file://${path.join(ROOT, "metadata", "collection.config.mjs").replace(/\\/g, "/")}`
);

const hypno = await import(
  `file://${path.join(ROOT, "metadata", "collections", "hypno-plush.config.mjs").replace(/\\/g, "/")}`
);

const JOBS = [
  {
    slug: "genesis",
    address: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    cfg: { COLLECTION, DESIGNS, SHUFFLE_SEED },
    imageDir: path.join(ROOT, "metadata", "out", "images"),
    expected: path.join(ROOT, "metadata", "out", "assignments.json"),
  },
  {
    slug: "hypno-plush",
    address: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    cfg: hypno,
    imageDir: path.join(ROOT, "metadata", "out", "hypno-plush", "images"),
    expected: path.join(ROOT, "metadata", "out", "hypno-plush", "assignments.json"),
  },
].map((j) => ({
  ...j,
  name: j.cfg.COLLECTION.name,
  description: j.cfg.COLLECTION.description,
  externalUrl: j.cfg.COLLECTION.externalUrl,
  seed: j.cfg.SHUFFLE_SEED,
  /**
   * Order matters and is not cosmetic: the deck is built by walking this array,
   * so a different order is a different shuffle even under the same seed. Taken
   * from the config exactly as written when the collection was generated.
   */
  designs: j.cfg.DESIGNS.map((d) => ({
    file: `${d.slug}.jpg`,
    name: d.name,
    count: d.count,
    ...(d.tier === undefined ? {} : { tier: d.tier }),
  })),
}));

// --- run --------------------------------------------------------------------

for (const job of JOBS) {
  console.log(`\n=== ${job.name} ===`);

  // 1. Reproduce the assignment and check it against what was recorded when the
  //    collection was generated. Nothing is pinned until this passes.
  const assignments = assignDesigns(job.designs, job.seed);
  const expectedRaw = JSON.parse(await readFile(job.expected, "utf8"));
  // The file wraps its rows: { collection, seed, imagesCid, generatedAt, tokens }.
  const expected = Array.isArray(expectedRaw) ? expectedRaw : expectedRaw.tokens;

  let mismatches = 0;
  for (const row of expected) {
    const got = assignments[row.tokenId - 1];
    if (got === undefined || got.design.name !== row.design) {
      mismatches++;
      if (mismatches <= 3) {
        console.log(`  MISMATCH #${row.tokenId}: recorded ${row.design}, reproduced ${got?.design.name}`);
      }
    }
  }
  if (mismatches > 0) {
    console.log(`  ${mismatches} of ${expected.length} tokens would change. Refusing to continue.`);
    continue;
  }
  console.log(`  assignment reproduces all ${expected.length} tokens exactly`);

  if (!PIN) {
    console.log("  dry run — pass --pin to upload");
    continue;
  }

  // 2. Pin each image, one CID apiece.
  const designs = [];
  for (const d of job.designs) {
    const bytes = await readFile(path.join(job.imageDir, d.file));
    const cid = await putObject(`${job.slug}/${d.file}`, bytes, "image/jpeg");
    designs.push({ ...d, cid });
    console.log(`  ${d.file.padEnd(18)} ${Math.round(bytes.length / 1024)}KB  ${cid}`);
  }

  // 3. Pin the manifest that ties them together.
  const manifest = {
    v: 2,
    name: job.name,
    description: job.description,
    externalUrl: job.externalUrl,
    gateway: "https://ipfs.filebase.io/ipfs",
    seed: job.seed,
    designs,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const manifestCid = await putObject(`${job.slug}/manifest.json`, manifestBytes, "application/json");

  console.log(`\n  manifest CID: ${manifestCid}`);
  console.log(`  new baseURI : https://www.valuemint.store/api/metadata/${manifestCid}/`);
  console.log(`\n  To finish, the collection owner sends:`);
  console.log(`    ${job.address}.setBaseURI("https://www.valuemint.store/api/metadata/${manifestCid}/")`);

  await writeFile(`migration-${job.slug}.json`, JSON.stringify({ manifestCid, manifest }, null, 2));
}
