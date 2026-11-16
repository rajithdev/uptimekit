import { checkSchema } from "@uptimekit/database";
import { db } from "@/lib/server/db";
import { pingRedis } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for load balancers and container orchestrators.
 *
 * Also the deployment safety gate: a release reports 503 until every migration it requires has
 * been applied, so the platform keeps routing to the previous release while (or if) the
 * migration job is still running or has failed.
 */
export async function GET() {
  const database = await db()
    .$queryRaw`SELECT 1`.then(() => true)
    .catch(() => false);
  const schema = database ? await checkSchema(db()) : { ready: false, missing: [] as string[] };
  const redis = await pingRedis();
  // Redis is optional for the web tier (rate limiting falls back to memory).
  const ok = database && schema.ready;
  return Response.json(
    { status: ok ? "ok" : "unhealthy", dependencies: { database, redis, schema: schema.ready }, ...(schema.missing.length ? { pendingMigrations: schema.missing } : {}) },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
