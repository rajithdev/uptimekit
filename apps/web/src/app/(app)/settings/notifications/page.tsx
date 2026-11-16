import type { Metadata } from "next";
import { NotificationSettingsView } from "@/components/app/notification-settings-view";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationSettingsPage() {
  return <NotificationSettingsView />;
}
