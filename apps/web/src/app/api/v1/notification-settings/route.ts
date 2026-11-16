import { notificationSettingsSchema } from "@uptimekit/shared";
import { authed, json, parseJson } from "@/lib/api/handler";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/server/services/incidents";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ user }) => {
  return json({ data: await getNotificationSettings(user.id, user.email) });
});

export const PUT = authed(async ({ request, user }) => {
  const body = await parseJson(request, notificationSettingsSchema);
  return json({ data: await updateNotificationSettings(user.id, user.email, body) });
});
