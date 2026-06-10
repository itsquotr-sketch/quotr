#!/usr/bin/env node
/**
 * Applies supabase/migrations/012_repair_live_schema.sql to the remote database.
 *
 * Requires DATABASE_URL in .env.local (Supabase → Settings → Database → URI):
 *   DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(`
ERROR: DATABASE_URL is not set.

Add your Supabase database connection string to .env.local:

  DATABASE_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

Find it in: Supabase Dashboard → Project Settings → Database → Connection string (URI)

Then run:  npm run db:repair

Alternatively, paste the contents of:
  supabase/migrations/012_repair_live_schema.sql
into Supabase Dashboard → SQL Editor → Run
`);
  process.exit(1);
}

const sqlPath = resolve(root, "supabase/migrations/012_repair_live_schema.sql");
const sql = readFileSync(sqlPath, "utf8");

const { default: pg } = await import("pg");
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected. Applying schema repair migration...");
  await client.query(sql);
  console.log("Schema repair applied successfully.");
  console.log("Restart dev server and reload localhost — projects should load now.");
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
