import { monitorListQuerySchema } from "@uptimekit/shared";
import { authed, enforceRateLimit, json, parseJson, parseQuery } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/server/rate-limit";
import { createMonitor, listMonitors, monitorSchemas } from "@/lib/server/services/monitors";

export const dynamic = "force-dynamic";

/** GET /api/v1/monitors — paginated, sortable, filterable list of the caller's monitors. */
export const GET = authed(async ({ request, user }) => {
  return json(await listMonitors(user.id, parseQuery(request, monitorListQuerySchema)));
});

/** POST /api/v1/monitors — create a monitor. */
export const POST = authed(async ({ request, user }) => {
  await enforceRateLimit(RATE_LIMITS.monitorCreate, user.id);
  const body = await parseJson(request, monitorSchemas().create);
  return json({ data: await createMonitor(user.id, body) }, 201);
});
