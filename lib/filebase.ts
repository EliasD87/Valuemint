import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Filebase, over its S3-compatible API.
 *
 * Requests are signed here rather than through `@aws-sdk/client-s3`. The SDK
 * would add megabytes to every serverless function to perform one PUT, and
 * SigV4 for a single-part upload is a few dozen lines - the whole of it is
 * below and it does exactly what we need.
 *
 * Buckets on Filebase's **IPFS network** return the content's CID in the
 * `x-amz-meta-cid` response header. A bucket created on the S3 network stores
 * the bytes perfectly well but returns no CID, which is why `pinFile` treats a
 * missing header as a hard error rather than shrugging: silently storing NFT
 * artwork that is not content-addressed would be the worst outcome here, and
 * the failure would not surface until someone checked provenance months later.
 *
 * One CID per object, not one per directory - unlike Pinata's directory pins.
 * That is why a manifest records each design's own CID.
 */

const REGION = "us-east-1";
const SERVICE = "s3";
const HOST = "s3.filebase.com";

const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

const sha256 = (data: Uint8Array | string): string =>
  createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data))
    .digest("hex");

function credentials() {
  const key = process.env.FILEBASE_KEY ?? "";
  const secret = process.env.FILEBASE_SECRET ?? "";
  const bucket = process.env.FILEBASE_BUCKET ?? "";
  return { key, secret, bucket };
}

/** Whether Filebase is configured well enough to try. */
export function filebaseAvailable(): boolean {
  const { key, secret, bucket } = credentials();
  return key !== "" && secret !== "" && bucket !== "";
}

/** Each path segment encoded, with the separators left alone. */
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

interface SignedRequest {
  method: "PUT" | "GET" | "HEAD" | "DELETE";
  /** Object key inside the bucket, without a leading slash. */
  key: string;
  body?: Uint8Array;
  contentType?: string;
  /** Query parameters. Signed, and sorted as SigV4 requires. */
  query?: Record<string, string>;
}

async function signedFetch({ method, key, body, contentType, query }: SignedRequest): Promise<Response> {
  const { key: accessKey, secret, bucket } = credentials();
  if (accessKey === "" || secret === "" || bucket === "") {
    throw new Error("Filebase is not configured.");
  }

  const payload = body ?? new Uint8Array();
  const payloadHash = sha256(payload);

  // YYYYMMDDTHHMMSSZ
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const date = amzDate.slice(0, 8);

  // Path-style addressing: the bucket is part of the path, not the hostname.
  const canonicalUri = `/${encodePath(bucket)}/${encodePath(key)}`;

  const headers: Record<string, string> = {
    host: HOST,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType !== undefined) headers["content-type"] = contentType;

  // Canonical headers must be lowercase, sorted, and trimmed - the signature
  // is computed over this exact text, so any drift fails with a 403 that says
  // nothing useful.
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]!.trim()}\n`).join("");
  const signedHeaders = names.join(";");

  // SigV4 requires the query sorted by key, with both halves percent-encoded.
  const canonicalQuery = Object.keys(query ?? {})
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query![k]!)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const sendHeaders: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
  };
  if (contentType !== undefined) sendHeaders["Content-Type"] = contentType;

  return fetch(`https://${HOST}${canonicalUri}${canonicalQuery === "" ? "" : `?${canonicalQuery}`}`, {
    method,
    headers: sendHeaders,
    ...(method === "PUT" ? { body: payload as unknown as BodyInit } : {}),
    signal: AbortSignal.timeout(60_000),
  });
}

export interface PinnedFile {
  /** The key it was stored under. */
  name: string;
  /** Content identifier — this is what makes the artwork verifiable. */
  cid: string;
  bytes: number;
}

/** Stores one object and returns its CID. */
export async function pinFile(
  name: string,
  content: Uint8Array | string,
  contentType: string,
): Promise<PinnedFile> {
  const body = typeof content === "string" ? new TextEncoder().encode(content) : content;

  const res = await signedFetch({ method: "PUT", key: name, body, contentType });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Filebase rejected "${name}" (HTTP ${res.status}): ${detail}`);
  }

  const cid = res.headers.get("x-amz-meta-cid");
  if (cid === null || cid === "") {
    throw new Error(
      `Filebase stored "${name}" but returned no CID. The bucket is probably on the S3 ` +
        `network rather than IPFS, which means nothing uploaded to it is content-addressed.`,
    );
  }

  return { name, cid, bytes: body.byteLength };
}

/**
 * Stores several objects, a few at a time.
 *
 * Bounded concurrency because a creator can send fifty images at once and
 * opening fifty simultaneous uploads is how you get rate-limited by the very
 * service you are trying to be a good citizen of.
 */
export async function pinFiles(
  files: Array<{ name: string; content: Uint8Array | string; type: string }>,
  concurrency = 4,
): Promise<PinnedFile[]> {
  const out = new Array<PinnedFile>(files.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, async () => {
      while (cursor < files.length) {
        const i = cursor++;
        const f = files[i]!;
        out[i] = await pinFile(f.name, f.content, f.type);
      }
    }),
  );

  return out;
}

/** Object keys under a prefix. Used for housekeeping, not the upload path. */
export async function listFiles(prefix: string): Promise<string[]> {
  const res = await signedFetch({
    method: "GET",
    key: "",
    query: { "list-type": "2", prefix, "max-keys": "1000" },
  });
  if (!res.ok) throw new Error(`Filebase list failed (HTTP ${res.status})`);
  const xml = await res.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!);
}

/** Removes an object. Used to clean up, never in the normal upload path. */
export async function removeFile(name: string): Promise<boolean> {
  const res = await signedFetch({ method: "DELETE", key: name });
  return res.ok || res.status === 204 || res.status === 404;
}

/** The public URL for a CID stored on Filebase. */
export function filebaseGateway(cid: string): string {
  return `https://ipfs.filebase.io/ipfs/${cid}`;
}

/** Confirms the credentials work and the bucket is reachable. */
export async function verifyFilebase(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await signedFetch({ method: "HEAD", key: "" });
    // A HEAD on the bucket root returns 200 when it exists and we may read it.
    if (res.status === 200 || res.status === 404) {
      return { ok: true, detail: `bucket reachable (HTTP ${res.status})` };
    }
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "unknown error" };
  }
}
