// scripts/turso-migrate.mjs
// Creates the app's tables in the Turso database.
//
// Usage (PowerShell, inside the aim-hye folder):
//   $env:TURSO_DATABASE_URL="libsql://..."; $env:TURSO_AUTH_TOKEN="..."
//   npm run db:migrate:turso            # create the tables (safe to run again)
//   npm run db:migrate:turso -- --reset # DELETE every table first, then create them (for a broken half-setup)
//
// Why not `prisma migrate deploy`? It only works with local SQLite files. Prisma's step-by-step
// migration files also rebuild tables with PRAGMA statements, and a run that fails halfway leaves a
// half-built database. Instead, on an EMPTY database this applies prisma/turso-schema.sql: the whole
// current schema in one clean script, generated with
//   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/turso-schema.sql
// (Turso's recommended approach for Prisma). Migrations added later are applied one by one on top.
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
if (!url) fail("TURSO_DATABASE_URL is not set in this PowerShell window (set it again: env variables don't survive closing the window).");
if (!/^(libsql|https|wss|file):/.test(url)) fail(`TURSO_DATABASE_URL should start with libsql:// (got "${url.slice(0, 20)}...").`);
if (url.startsWith("libsql:") && !authToken) fail("TURSO_AUTH_TOKEN is not set.");

const db = createClient({ url, authToken });

// 1. Can we reach the database at all? (wrong URL or token fail here with a clear message)
try {
  await db.execute("SELECT 1");
} catch (e) {
  fail(`Could not connect to Turso: ${e.message}\n` +
       "  -> 401/unauthorized: create a new token for THIS database and set TURSO_AUTH_TOKEN again\n" +
       "  -> not found / ENOTFOUND: copy the database URL again from the Turso dashboard");
}

const tables = async () => (await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'"
)).rows.map((r) => r.name);

// 2. Optional reset: wipe a half-built database so we can start clean
if (process.argv.includes("--reset")) {
  const existing = await tables();
  let left = [...existing];
  // A table referenced by another can't be dropped first, so retry in passes until all are gone
  for (let pass = 0; pass < 10 && left.length; pass++) {
    const next = [];
    for (const t of left) {
      try { await db.execute(`DROP TABLE IF EXISTS "${t}"`); } catch { next.push(t); }
    }
    left = next;
  }
  if (left.length) fail(`could not drop: ${left.join(", ")}`);
  await db.execute("DROP TABLE IF EXISTS _applied_migrations");
  console.log(`reset: dropped ${existing.length} tables`);
}

await db.execute(`CREATE TABLE IF NOT EXISTS _applied_migrations (
  name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
const done = new Set((await db.execute("SELECT name FROM _applied_migrations")).rows.map((r) => r.name));

const dir = path.join(process.cwd(), "prisma", "migrations");
if (!statSync(dir, { throwIfNoEntry: false })) fail("Run this from inside the aim-hye folder (cd aim-hye).");
const folders = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory()).sort();

// Split a .sql file into statements (no statement in these files contains a ';' inside quotes)
const statements = (sql) =>
  sql.split(";").map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);

async function run(label, sql) {
  try {
    await db.batch(statements(sql), "write");               // a batch is one transaction: all or nothing
  } catch (e) {
    fail(`${label} failed: ${e.message}\n  Nothing from this step was saved. Fix the cause and run again.`);
  }
}

// 3. Empty database: create everything from the one clean schema script
if (done.size === 0) {
  const existing = await tables();
  if (existing.length > 0) {
    fail(`The database already has ${existing.length} tables (${existing.slice(0, 4).join(", ")}...) from an earlier,\n` +
         "  unfinished attempt. Run again with --reset to start clean:  npm run db:migrate:turso -- --reset");
  }
  await run("Creating the tables", readFileSync(path.join(process.cwd(), "prisma", "turso-schema.sql"), "utf8"));
  await db.batch(folders.map((name) => ({ sql: "INSERT INTO _applied_migrations (name) VALUES (?)", args: [name] })), "write");
  console.log(`created ${(await tables()).length} tables (schema includes all ${folders.length} migrations)`);
} else {
  // 4. Existing database: apply only migrations added since it was created
  for (const name of folders) {
    if (done.has(name)) continue;
    await run(`Migration ${name}`, readFileSync(path.join(dir, name, "migration.sql"), "utf8"));
    await db.execute({ sql: "INSERT INTO _applied_migrations (name) VALUES (?)", args: [name] });
    console.log(`applied ${name}`);
  }
}
console.log("Database is up to date. Next: npm run seed");

function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}
