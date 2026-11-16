import { db } from "@/lib/server/db";
import { pingRedis } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** Liveness/readiness for load balancers and container orchestrators. */
export async function GET() {
  const database = await db()
    .$queryRaw`SELECT 1`.then(() => true)
    .catch(() => false);
  const redis = await pingRedis();
  // Redis is optional for the web tier (rate limiting falls back to memory).
  const ok = database;
  return Response.json(
    { status: ok ? "ok" : "unhealthy", dependencies: { database, redis } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
