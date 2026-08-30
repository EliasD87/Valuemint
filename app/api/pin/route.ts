import { NextResponse } from "next/server";
import { assignDesigns, supplyOf, type DesignInput } from "@/lib/buildMetadata";
import type { CollectionManifest, ManifestDesign } from "@/lib/collectionManifest";
import { filebaseAvailable, pinFile, pinFiles, verifyFilebase } from "@/lib/filebase";
import { optimiseArtwork } from "@/lib/optimiseArtwork";

/**
 * Whether artwork can be stored at all.
 *
 * Either backend will do. This used to require PINATA_JWT specifically, which
 * meant a deployment configured with Filebase alone - the only backend new
 * uploads actually use - refused every upload with "not configured".
 */
function storageAvailable(): boolean {
  return filebaseAvailable() || pinningAvailable();
}
import { gatewayUrl, pinDirectory, pinningAvailable, verifyCredential } from "@/lib/pinning";
import { authoriseUpload, precheckClaim } from "@/lib/uploadAuth";
import { callerKey, limiter } from "@/lib/rateLimit";

/**
 * Pins a creator's artwork and generates the metadata for it.
 *
 * Two steps in one request, because they are useless apart: the metadata has to
 * embed the images' CID, so the images must be pinned first and the JSON built
 * from the result.
 *
 * The Pinata credential lives only here, on the server. A browser that could see
 * it could fill the account with anything.
 *
 * This endpoint spends a paid account, so it is gated. Every upload must carry
 * a wallet signature over a digest of its own contents, from an address holding
 * a minimum balance on ValueChain, and is rate limited per address and per
 * caller. See lib/uploadAuth.ts for why all three are needed.
 */

/** Uploads allowed per wallet, and per caller address, in an hour. */
const PER_WALLET_PER_HOUR = 5;
const PER_CALLER_PER_HOUR = 10;
/** The readiness probe reaches out to Pinata, so it is capped too. */
const PROBE_PER_HOUR = 30;
const HOUR = 60 * 60 * 1000;

/**
 * The readiness answer barely changes, and every miss is an outbound call to
 * Pinata - an amplification vector if the probe is hammered.
 */
let probeCache: { at: number; ready: boolean } | undefined;
const PROBE_TTL = 60_000;

/** Where Filebase-stored CIDs are served from. */
const FILEBASE_GATEWAY = "https://ipfs.filebase.io/ipfs";

/**
 * The public origin to bake into a collection's baseURI.
 *
 * Deliberately not derived from the incoming request: a creator running the app
 * locally would otherwise deploy a contract whose metadata lives at
 * `http://localhost:5173`, permanently, for everyone.
 */
function siteUrl(): string {
  const raw = process.env.SITE_URL ?? "https://www.valuemint.store";
  return raw.replace(/\/+$/, "");
}

/** Guards against a single request consuming the whole storage allowance. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
/**
 * Supply no longer costs pinned files — one manifest describes any size — so
 * this cap is now only about work per request: the assignment shuffle is O(n)
 * and the result is held in memory. It matches the manifest parser's own guard.
 */
const MAX_SUPPLY = 100_000;

export async function GET(request: Request) {
  // Lets the creator be told up front whether uploads work at all, rather than
  // failing after they have chosen their artwork.
  if (!storageAvailable()) {
    return NextResponse.json({ ready: false, reason: "not-configured" });
  }

  const gate = await limiter.take(`probe:${callerKey(request)}`, PROBE_PER_HOUR, HOUR);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const now = Date.now();
  if (probeCache !== undefined && now - probeCache.at < PROBE_TTL) {
    return NextResponse.json({ ready: probeCache.ready });
  }
  // Check whichever backend will actually be used, not always Pinata.
  const ready = filebaseAvailable() ? (await verifyFilebase()).ok : await verifyCredential();
  probeCache = { at: now, ready };
  return NextResponse.json({ ready });
}

export async function POST(request: Request) {
  if (!storageAvailable()) {
    return NextResponse.json(
      { error: "Uploads are not configured on this server." },
      { status: 503 },
    );
  }

  // --- gate, before the body is touched -------------------------------------
  // Order matters: everything below rejects without buffering the multipart
  // payload, so the cheap abuse cases stay cheap to refuse.

  const claim = precheckClaim(request);
  if (!claim.ok) {
    return NextResponse.json({ error: claim.error }, { status: claim.status });
  }

  const caller = await limiter.take(`pin:${callerKey(request)}`, PER_CALLER_PER_HOUR, HOUR);
  if (!caller.ok) {
    return NextResponse.json(
      { error: "Too many uploads from here. Try again later." },
      { status: 429, headers: { "Retry-After": String(caller.retryAfter) } },
    );
  }

  // Declared size is not authoritative, but a body that admits to being over
  // the limit need not be read at all.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_TOTAL_BYTES * 1.1) {
    return NextResponse.json({ error: "That upload is too large in total." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const images = form.getAll("images").filter((f): f is File => f instanceof File);
  const rawConfig = form.get("config");

  if (images.length === 0) return NextResponse.json({ error: "No images." }, { status: 400 });
  if (images.length > MAX_FILES) {
    return NextResponse.json({ error: `At most ${MAX_FILES} designs per collection.` }, { status: 400 });
  }
  if (typeof rawConfig !== "string") {
    return NextResponse.json({ error: "Missing configuration." }, { status: 400 });
  }

  let config: {
    collectionName: string;
    description: string;
    seed: string;
    externalUrl?: string;
    designs: Array<{ file: string; name: string; count: number; tier?: string }>;
  };
  try {
    config = JSON.parse(rawConfig);
  } catch {
    return NextResponse.json({ error: "Configuration is not valid JSON." }, { status: 400 });
  }

  // --- the signature must cover exactly this upload -------------------------
  // As early as it can be: a File exposes its name and size without reading a
  // byte, so the whole claim is checked before up to 60 MB is copied out of the
  // parsed body, and long before anything is pinned.
  //
  // `rawConfig` is passed verbatim. Re-serialising the parsed object would
  // change key order and the digest would stop matching what was signed.
  const auth = await authoriseUpload({
    address: claim.claim.address,
    signature: claim.claim.signature,
    issuedAt: claim.claim.issuedAt,
    collectionName: config.collectionName,
    configJson: rawConfig,
    files: images.map((i) => ({ name: i.name, size: i.size })),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Only now is there a verified address to count against.
  const wallet = await limiter.take(
    `pin:wallet:${auth.address.toLowerCase()}`,
    PER_WALLET_PER_HOUR,
    HOUR,
  );
  if (!wallet.ok) {
    return NextResponse.json(
      {
        error: `That wallet has uploaded ${PER_WALLET_PER_HOUR} collections in the last hour. Try again later.`,
      },
      { status: 429, headers: { "Retry-After": String(wallet.retryAfter) } },
    );
  }

  const supply = supplyOf(config.designs as DesignInput[]);
  if (supply > MAX_SUPPLY) {
    return NextResponse.json(
      { error: `That describes ${supply} tokens; the limit here is ${MAX_SUPPLY}.` },
      { status: 400 },
    );
  }

  // --- images ---------------------------------------------------------------
  const files: Array<{ name: string; content: Uint8Array; type: string }> = [];
  /**
   * Original upload name to the name actually stored.
   *
   * Optimising can change the extension — a PNG becomes .webp or .jpg — and the
   * incoming `designs[].file` still names the original. Every lookup keyed on a
   * filename has to go through this, or a design points at a file that was
   * never stored under that name.
   */
  const renamed = new Map<string, string>();
  let total = 0;
  let bytesIn = 0;
  let bytesOut = 0;

  for (const image of images) {
    if (image.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `"${image.name}" is over ${MAX_FILE_BYTES / 1024 / 1024} MB.` },
        { status: 400 },
      );
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: `"${image.name}" is not an image.` }, { status: 400 });
    }

    total += image.size;
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "That upload is too large in total." }, { status: 400 });
    }

    // Names are normalised so they survive every gateway and filesystem intact.
    const normalised = image.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");

    /**
     * Shrunk here, at the only moment it can be. A CID addresses exact bytes,
     * so once this is pinned the file is that size forever — for the storage
     * allowance and for every visitor who loads it.
     */
    const optimised = await optimiseArtwork(
      normalised,
      new Uint8Array(await image.arrayBuffer()),
      image.type,
    );

    /**
     * Re-encoding can make two different uploads collide: "art.png" and
     * "art.jpg" both become "art.jpg", the second overwrites the first in the
     * bucket, and two designs end up pointing at one image. Disambiguate before
     * anything is stored.
     */
    let storedName = optimised.name;
    if (files.some((f) => f.name === storedName)) {
      const dot = storedName.lastIndexOf(".");
      const base = dot === -1 ? storedName : storedName.slice(0, dot);
      const ext = dot === -1 ? "" : storedName.slice(dot);
      let n = 2;
      while (files.some((f) => f.name === `${base}-${n}${ext}`)) n++;
      storedName = `${base}-${n}${ext}`;
    }

    bytesIn += optimised.originalBytes;
    bytesOut += optimised.optimisedBytes;
    if (storedName !== normalised) renamed.set(normalised, storedName);

    files.push({ name: storedName, content: optimised.content, type: optimised.type });
  }

  try {
    // --- artwork ------------------------------------------------------------
    // Two storage backends, two shapes of manifest. Filebase addresses each
    // object individually and returns no directory CID; Pinata pins a whole
    // folder under one. Neither is wrong - the manifest records which it is so
    // a reader never has to guess.
    let designs: ManifestDesign[];
    let imagesCid: string | undefined;
    let gateway: string | undefined;
    let stored: { cid: string; files: number; bytes: number };

    if (filebaseAvailable()) {
      // Keyed under the seed, which is unique per creation, so two collections
      // that happen to share a filename cannot overwrite each other.
      const uploaded = await pinFiles(
        files.map((f) => ({ ...f, name: `collections/${config.seed}/${f.name}` })),
      );

      const cidByFile = new Map(
        uploaded.map((u) => [u.name.slice(u.name.lastIndexOf("/") + 1), u.cid]),
      );

      designs = (config.designs as DesignInput[]).map((d) => {
        // The stored name, which optimising may have re-extensioned.
        const file = renamed.get(d.file) ?? d.file;
        const cid = cidByFile.get(file);
        if (cid === undefined) throw new Error(`"${d.file}" was not among the uploaded images.`);
        return { ...d, file, cid };
      });

      gateway = FILEBASE_GATEWAY;
      stored = {
        cid: designs[0]!.cid!,
        files: uploaded.length,
        bytes: uploaded.reduce((n, u) => n + u.bytes, 0),
      };
    } else {
      const pinnedImages = await pinDirectory(files, `${config.collectionName}-images`);
      designs = config.designs as DesignInput[];
      imagesCid = pinnedImages.cid;
      stored = { cid: pinnedImages.cid, files: files.length, bytes: total };
    }

    // --- manifest -----------------------------------------------------------
    // One pinned file describing the whole collection, rather than one file per
    // token. The assignment is a seeded shuffle, so it is recomputed on request
    // by /api/metadata instead of being stored a thousand times over. A pinning
    // account runs out of *files* long before it runs out of storage, and the
    // old shape made a collection cost files in proportion to its supply.
    const manifest: CollectionManifest = {
      v: imagesCid === undefined ? 2 : 1,
      name: config.collectionName,
      description: config.description,
      seed: config.seed,
      designs,
      ...(imagesCid === undefined ? {} : { imagesCid }),
      ...(gateway === undefined ? {} : { gateway }),
      ...(config.externalUrl === undefined ? {} : { externalUrl: config.externalUrl }),
    };

    const manifestJson = `${JSON.stringify(manifest)}
`;
    const pinnedManifest = filebaseAvailable()
      ? await pinFile(`collections/${config.seed}/manifest.json`, manifestJson, "application/json")
      : await pinDirectory(
          [{ name: "manifest.json", content: manifestJson, type: "application/json" }],
          `${config.collectionName}-manifest`,
        );

    // A sample, so the creator sees the shuffle actually shuffled before they
    // commit it to an immutable contract.
    const assignments = assignDesigns(manifest.designs, manifest.seed);
    const sample = assignments.slice(0, 3).map((a, i) => ({
      tokenId: i + 1,
      design: a.design.name,
      edition: `${a.edition} of ${a.design.count}`,
    }));

    return NextResponse.json({
      storage: filebaseAvailable() ? "filebase" : "pinata",
      /**
       * What the resize actually saved. Reported so the creator can see their
       * 40MB of PNGs became 3MB, and so a regression here shows up as a number
       * rather than a slowly filling bucket.
       */
      optimised: {
        bytesIn,
        bytesOut,
        saved: bytesIn - bytesOut,
        percent: bytesIn === 0 ? 0 : Math.round((1 - bytesOut / bytesIn) * 100),
      },
      images: stored,
      manifest: pinnedManifest,
      // The contract concatenates `baseURI + tokenId`, so this must end in a
      // slash and must be the public site, never the host that happens to be
      // serving this request - a collection created from localhost would
      // otherwise bake localhost into an immutable contract.
      baseUri: `${siteUrl()}/api/metadata/${pinnedManifest.cid}/`,
      manifestIpfs: `ipfs://${pinnedManifest.cid}`,
      supply: assignments.length,
      sample,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pinning failed." },
      { status: 502 },
    );
  }
}
