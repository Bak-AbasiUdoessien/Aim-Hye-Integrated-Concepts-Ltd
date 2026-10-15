import path from "node:path";

// Where the database lives.
// - Hosted (Vercel): set TURSO_DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN. Serverless hosts can't
//   keep changes to files, so the database must live on a database server, not in prisma/dev.db.
// - Local development: falls back to the SQLite file prisma/dev.db.
export function libsqlConfig(): { url: string; authToken?: string } {
  if (process.env.TURSO_DATABASE_URL) {
    return { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN };
  }
  const dbPath = path.join(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  return { url: `file:${dbPath}` };
}
