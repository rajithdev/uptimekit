import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoMonitorDetail } from "@/components/demo/demo-monitor-detail";
import { DemoSkeleton } from "@/components/demo/demo-skeleton";
import { Hydrated } from "@/components/demo/hydrated";
import { buildDemoDataset, findDemoMonitor } from "@/lib/demo/fixtures";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: findDemoMonitor(buildDemoDataset(), id)?.name ?? "Monitor" };
}

export default async function DemoMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = buildDemoDataset();
  const monitor = findDemoMonitor(data, id);
  if (!monitor) notFound();
  return (
    <Hydrated fallback={<DemoSkeleton />}>
      <DemoMonitorDetail
      monitor={monitor}
      stats={data.stats[id]!}
      checks={data.checks[id]!}
      incidents={data.incidents.filter((i) => i.monitorId === id)}
      now={new Date(data.generatedAt).getTime()}
    />
    </Hydrated>
  );
}
