import { checkListQuerySchema } from "@uptimekit/shared";
import { authed, json, parseQuery } from "@/lib/api/handler";
import { listChecks } from "@/lib/server/services/incidents";

export const dynamic = "force-dynamic";

/** GET /api/v1/monitors/:id/checks — raw check history (paginated, filterable by result and time). */
export const GET = authed<{ id: string }>(async ({ request, user, params }) => {
  return json(await listChecks(user.id, params.id, parseQuery(request, checkListQuerySchema)));
});
