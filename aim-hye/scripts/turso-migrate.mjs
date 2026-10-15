// scripts/turso-migrate.mjs
// Applies the SQL files in prisma/migrations/ to the Turso database, oldest first, skipping any
// already applied. (`prisma migrate deploy` only talks to local SQLite files, so this does its job for Turso.)
//
// Usage (PowerShell):  $env:TURSO_DATABASE_URL="libsql://..."; $env:TURSO_AUTH_TOKEN="..."; node scripts/turso-migrate.mjs
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) first.");
  process.exit(1);
}
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// Remember which migrations have run, so running this twice is safe
await db.execute(`CREATE TABLE IF NOT EXISTS _applied_migrations (
  name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
const done = new Set((await db.execute("SELECT name FROM _applied_migrations")).rows.map((r) => r.name));

const dir = path.join(process.cwd(), "prisma", "migrations");
const folders = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory()).sort(); // timestamps sort in order

for (const name of folders) {
  if (done.has(name)) { console.log(`skip    ${name}`); continue; }
  const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  await db.executeMultiple(sql);                                   // run every statement in the file
  await db.execute({ sql: "INSERT INTO _applied_migrations (name) VALUES (?)", args: [name] });
  console.log(`applied ${name}`);
}
console.log("Database is up to date.");
