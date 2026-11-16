import { authed, json, parseJson } from "@/lib/api/handler";
import { deleteMonitor, getOwnedMonitor, monitorSchemas, updateMonitor } from "@/lib/server/services/monitors";
import { toMonitorDto } from "@/lib/server/services/serializers";

export const dynamic = "force-dynamic";
type P = { id: string };

export const GET = authed<P>(async ({ user, params }) => {
  return json({ data: toMonitorDto(await getOwnedMonitor(user.id, params.id)) });
});

export const PATCH = authed<P>(async ({ request, user, params }) => {
  const body = await parseJson(request, monitorSchemas().update);
  return json({ data: await updateMonitor(user.id, params.id, body) });
});

export const DELETE = authed<P>(async ({ user, params }) => {
  await deleteMonitor(user.id, params.id);
  return new Response(null, { status: 204 });
});
