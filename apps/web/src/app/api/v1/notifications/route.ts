import { z } from "zod";
import { authed, json, parseQuery } from "@/lib/api/handler";
import { listNotifications } from "@/lib/server/services/incidents";

export const dynamic = "force-dynamic";

const query = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/v1/notifications — alert delivery log (status, attempts, errors). */
export const GET = authed(async ({ request, user }) => {
  const q = parseQuery(request, query);
  return json(await listNotifications(user.id, q.page, q.pageSize));
});
