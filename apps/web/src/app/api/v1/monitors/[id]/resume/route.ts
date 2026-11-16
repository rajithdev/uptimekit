import { authed, json } from "@/lib/api/handler";
import { resumeMonitor } from "@/lib/server/services/monitors";

export const dynamic = "force-dynamic";

export const POST = authed<{ id: string }>(async ({ user, params }) => {
  return json({ data: await resumeMonitor(user.id, params.id) });
});
