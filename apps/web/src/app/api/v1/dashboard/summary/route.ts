import { authed, json } from "@/lib/api/handler";
import { getDashboardSummary } from "@/lib/server/services/stats";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ user }) => {
  return json({ data: await getDashboardSummary(user.id) });
});
