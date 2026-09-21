#!/usr/bin/env node
/**
 * Drive the indexer against a running dev server.
 *
 *   npm run index:sync          one pass, prints what landed
 *   npm run index:sync -- watch keeps going every 15 seconds
 *   npm run index:sync -- reset  rewind to Seaport's deployment and replay
 *
 * This is the local stand-in for the scheduler. In production the same route is
 * called by Supabase's own cron, which is why the loop lives here and not
 * inside the route: a thing that keeps itself alive is a thing that has to be
 * stopped, and there is nothing to stop in a serverless function.
 *
 * Reads the secret out of `.env.local` and never prints it.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env.local");

/**
 * A three-line parser rather than dotenv.
 *
 * It reads `KEY=value`, ignores comments and blank lines, and strips one layer
 * of quotes. That is the whole of what this file needs, and it keeps a build
 * dependency out of a script that exists to be run by hand.
 */
async function readEnv() {
  let text;
  try {
    text = await readFile(envPath, "utf8");
  } catch {
    console.error(`No .env.local found at ${envPath}`);
    process.exit(1);
  }

  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = await readEnv();

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "INDEX_SYNC_SECRET"].filter(
  (k) => (env[k] ?? "") === "",
);
if (missing.length > 0) {
  console.error(`Missing from .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const base = process.env.INDEX_BASE_URL ?? "http://localhost:5173";
const watch = process.argv.includes("watch");
const reset = process.argv.includes("reset");

/**
 * Rewind the watermark and read the chain again from Seaport's first block.
 *
 * The index is a cache of public state, so this is always available and always
 * safe: every row it holds is reconstructible, and the writes are upserts, so a
 * replay overwrites rather than duplicating. When the index and the chain
 * disagree, this is the fix — never a hand-edited row, which produces a
 * database nobody can reason about.
 */
if (reset) {
  const url = env.SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  const response = await fetch(`${url}/rest/v1/index_cursor?name=eq.seaport`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ last_block: 14407869 }),
  });
  if (!response.ok) {
    console.error(`Could not rewind the cursor: ${response.status}`);
    process.exit(1);
  }
  console.log("Cursor rewound to Seaport's deployment block. Replaying.");
}

async function once() {
  const started = Date.now();
  let response;
  try {
    response = await fetch(`${base}/api/index/sync`, {
      method: "POST",
      headers: { "x-index-secret": env.INDEX_SYNC_SECRET },
    });
  } catch (err) {
    console.error(`Could not reach ${base} — is \`npm run dev\` running?`);
    console.error(`  ${err.message}`);
    return false;
  }

  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error(`${response.status} — ${body.slice(0, 300)}`);
    return false;
  }

  if (!response.ok) {
    console.error(`${response.status} ${parsed.error ?? ""} ${parsed.message ?? ""}`);
    if (parsed.hint !== undefined) console.error(`  ${parsed.hint}`);
    return false;
  }

  const behind = parsed.behind ?? 0;
  console.log(
    [
      `head ${parsed.head}`,
      `indexed ${parsed.indexed}`,
      `behind ${behind}`,
      `orders +${parsed.orders}`,
      `filled ${parsed.filled}`,
      `cancelled ${parsed.cancelled}`,
      parsed.done ? "caught up" : "MORE TO READ",
      `${Date.now() - started}ms`,
    ].join("  "),
  );
  return true;
}

if (watch) {
  console.log(`Syncing ${base} every 15s. Ctrl-C to stop.`);
  for (;;) {
    await once();
    await new Promise((r) => setTimeout(r, 15_000));
  }
} else {
  const ok = await once();
  process.exit(ok ? 0 : 1);
}
