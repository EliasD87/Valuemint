#!/usr/bin/env node
/**
 * Lists applications to the KOL collection, newest first.
 *
 *   node scripts/kol-applications.mjs            a table
 *   node scripts/kol-applications.mjs --csv      CSV, to paste into a sheet
 *   node scripts/kol-applications.mjs --status new
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from `.env.local` and never
 * prints them. Read-only: marking someone accepted or declined is done in the
 * Supabase table editor (the `status` column).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

async function readEnv() {
  let text;
  try {
    text = await readFile(join(here, "..", ".env.local"), "utf8");
  } catch {
    console.error("No .env.local found next to package.json.");
    process.exit(1);
  }
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[t.slice(0, eq).trim()] = v;
  }
  return env;
}

const env = await readEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const csv = args.includes("--csv");
const statusAt = args.indexOf("--status");
const status = statusAt === -1 ? undefined : args[statusAt + 1];

const base = env.SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const query =
  "kol_applications?select=wallet,x_handle,status,created_at,updated_at&order=created_at.desc&limit=1000" +
  (status ? `&status=eq.${encodeURIComponent(status)}` : "");
const res = await fetch(`${base}/rest/v1/${query}`, {
  headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
});
if (!res.ok) {
  const detail = await res.text();
  console.error(`Supabase answered ${res.status}. ${/does not exist|PGRST205/.test(detail) ? "The kol_applications table has not been created yet: run its part of supabase/schema.sql." : detail.slice(0, 200)}`);
  // exitCode, not exit(): exiting while the connection closes trips a libuv assertion on Windows.
  process.exitCode = 1;
} else if (csv) {
  const rows = await res.json();
  console.log("x_handle,wallet,status,applied_utc,updated_utc");
  for (const r of rows) console.log([`@${r.x_handle}`, r.wallet, r.status, r.created_at, r.updated_at].join(","));
} else {
  const rows = await res.json();
  console.log(`${rows.length} application(s)${status ? ` with status "${status}"` : ""}\n`);
  for (const r of rows) {
    const when = r.created_at.slice(0, 16).replace("T", " ");
    console.log(`${when} UTC  ${`@${r.x_handle}`.padEnd(18)} ${r.wallet}  ${r.status}  https://x.com/${r.x_handle}`);
  }
}
