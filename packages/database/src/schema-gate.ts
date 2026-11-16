import type { PrismaClient } from "./generated/prisma/client";
import { REQUIRED_MIGRATIONS } from "./migrations-manifest";

export interface SchemaStatus {
  ready: boolean;
  /** Migrations this release needs that the database has not (successfully) applied. */
  missing: string[];
}

/**
 * Deployment safety gate. A release must not serve traffic or process jobs until every
 * migration it was built against has been applied. Web reports unhealthy and the worker waits
 * at startup until this returns ready, so the platform keeps the previous release running while
 * the migration job is in progress — and forever, if the migration fails.
 */
export async function checkSchema(prisma: PrismaClient, required: readonly string[] = REQUIRED_MIGRATIONS): Promise<SchemaStatus> {
  let applied: string[];
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    applied = rows.map((r) => r.migration_name);
  } catch {
    // No migrations table yet (fresh database): nothing is applied.
    applied = [];
  }
  const set = new Set(applied);
  const missing = required.filter((m) => !set.has(m));
  return { ready: missing.length === 0, missing };
}
