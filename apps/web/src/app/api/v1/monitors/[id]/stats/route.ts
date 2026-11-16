import { statsQuerySchema } from "@uptimekit/shared";
import { authed, json, parseQuery } from "@/lib/api/handler";
import { getMonitorStats } from "@/lib/server/services/stats";

export const dynamic = "force-dynamic";

/** GET /api/v1/monitors/:id/stats?range=24h|7d|30d — aggregated uptime and latency. */
export const GET = authed<{ id: string }>(async ({ request, user, params }) => {
  const { range } = parseQuery(request, statsQuerySchema);
  return json({ data: await getMonitorStats(user.id, params.id, range) });
});
