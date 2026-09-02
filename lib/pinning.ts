import "server-only";

/**
 * Pinning, isolated behind one interface.
 *
 * Everything provider-specific lives here so the rest of the app only knows
 * "give me a CID". Swapping Pinata for Arweave or a second pinning service later
 * means rewriting this file and nothing else.
 *
 * `server-only` is not decoration: the credential below must never reach a
 * browser bundle, and that import makes the build fail loudly if a client
 * component ever pulls this in by accident.
 */

const PINATA_API = "https://api.pinata.cloud";

export interface PinResult {
  cid: string;
  files: number;
  bytes: number;
}

function credential(): string {
  const jwt = process.env.PINATA_JWT;
  if (jwt === undefined || jwt.trim() === "") {
    throw new Error(
      "PINATA_JWT is not set. Uploads are disabled until it is configured on the server.",
    );
  }
  return jwt.trim();
}

/** True when the server is configured to pin at all. Lets the UI say so up front. */
export function pinningAvailable(): boolean {
  const jwt = process.env.PINATA_JWT;
  return jwt !== undefined && jwt.trim() !== "";
}

/**
 * Pins a set of named files as one IPFS directory.
 *
 * The directory is what makes `baseURI + tokenId` resolve: the CID addresses the
 * folder, and each name inside it is reachable as `ipfs://<cid>/<name>`.
 */
export async function pinDirectory(
  files: Array<{ name: string; content: Uint8Array | string; type?: string }>,
  label: string,
): Promise<PinResult> {
  if (files.length === 0) throw new Error("Nothing to pin.");

  const form = new FormData();
  let bytes = 0;

  for (const file of files) {
    const body =
      typeof file.content === "string" ? new TextEncoder().encode(file.content) : file.content;
    bytes += body.byteLength;

    form.append(
      "file",
      new Blob([body as BlobPart], { type: file.type ?? "application/octet-stream" }),
      // The leading folder name is what makes Pinata store this as a directory
      // rather than a pile of loose files.
      `${label}/${file.name}`,
    );
  }

  form.append("pinataMetadata", JSON.stringify({ name: label }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1, wrapWithDirectory: false }));

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential()}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Pinning failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return { cid: IpfsHash, files: files.length, bytes };
}

/** Confirms the credential works before an upload is attempted. */
export async function verifyCredential(): Promise<boolean> {
  try {
    const res = await fetch(`${PINATA_API}/data/testAuthentication`, {
      headers: { Authorization: `Bearer ${credential()}` },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Public gateway for a pinned CID.
 *
 * Content pinned on Pinata's free tier is not advertised widely enough for public
 * gateways to find it - ipfs.io, dweb.link and w3s.link all time out on these
 * CIDs - so URLs handed to browsers point at a gateway known to serve them. The
 * CID stays in the path, so the content remains addressable by anyone with IPFS
 * even if this gateway disappears.
 */
/**
 * The dedicated gateway whose free plan is exhausted, and what to use instead.
 *
 * Mirrors the rewrite in lib/format.ts, and it has to exist separately because
 * this one runs on the server: the URL built here is written into the metadata
 * document itself, which external marketplaces read without ever running our
 * client code. Fixing it only on the client would leave every other consumer
 * pointed at a host that answers 403.
 *
 * Applied after the env var is read rather than instead of it, so the variable
 * still selects a gateway - it just cannot select this dead one.
 */
const EXHAUSTED_GATEWAY = "lavender-tiny-loon-904.mypinata.cloud";
const PUBLIC_GATEWAY = "gateway.pinata.cloud";

export function gatewayUrl(cid: string, path = ""): string {
  const gateway = process.env.PINATA_GATEWAY?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const configured = gateway === undefined || gateway === "" ? PUBLIC_GATEWAY : gateway;
  const host = configured === EXHAUSTED_GATEWAY ? PUBLIC_GATEWAY : configured;
  return `https://${host}/ipfs/${cid}${path === "" ? "" : `/${path}`}`;
}
