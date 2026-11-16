import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { MonitorForm } from "@/components/monitors/monitor-form";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/server/session";
import { getOwnedMonitor } from "@/lib/server/services/monitors";
import { toMonitorDto } from "@/lib/server/services/serializers";

export const metadata: Metadata = { title: "Edit monitor" };

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const monitor = await getOwnedMonitor(user.id, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${monitor.name}`} />
      <MonitorForm monitor={toMonitorDto(monitor)} />
    </div>
  );
}
