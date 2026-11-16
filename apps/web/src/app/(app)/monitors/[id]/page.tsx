import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonitorDetail } from "@/components/monitors/monitor-detail";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/server/session";
import { getOwnedMonitor } from "@/lib/server/services/monitors";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const m = await getOwnedMonitor(user.id, id).catch(() => null);
  return { title: m?.name ?? "Monitor" };
}

export default async function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await getOwnedMonitor(user.id, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return <MonitorDetail id={id} />;
}
