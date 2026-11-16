import { execSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

/**
 * Test helper: create a database (if missing) and apply all migrations to it.
 * Used by integration and E2E suites so each suite gets an isolated database.
 */
export async function prepareTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Refusing unexpected database name: ${name}`);
  const admin = new URL(databaseUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
