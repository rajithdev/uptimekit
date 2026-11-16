import type { Metadata } from "next";
import { AccountSettingsView } from "@/components/app/account-settings-view";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountSettingsPage() {
  const user = await requireUser();
  return <AccountSettingsView user={{ name: user.name, email: user.email }} />;
}
