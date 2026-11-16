import { incidentListQuerySchema } from "@uptimekit/shared";
import { authed, json, parseQuery } from "@/lib/api/handler";
import { listIncidents } from "@/lib/server/services/incidents";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ request, user }) => {
  return json(await listIncidents(user.id, parseQuery(request, incidentListQuerySchema)));
});
