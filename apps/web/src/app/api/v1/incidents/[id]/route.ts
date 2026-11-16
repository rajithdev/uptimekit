import { authed, json } from "@/lib/api/handler";
import { getIncident } from "@/lib/server/services/incidents";

export const dynamic = "force-dynamic";

export const GET = authed<{ id: string }>(async ({ user, params }) => {
  return json({ data: await getIncident(user.id, params.id) });
});
