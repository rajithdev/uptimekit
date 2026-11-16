import type { Metadata } from "next";
import { DemoIncidents } from "@/components/demo/demo-incidents";
import { DemoSkeleton } from "@/components/demo/demo-skeleton";
import { Hydrated } from "@/components/demo/hydrated";
import { buildDemoDataset } from "@/lib/demo/fixtures";

export const metadata: Metadata = { title: "Incidents" };
export const revalidate = 300;

export default function DemoIncidentsPage() {
  const data = buildDemoDataset();
  return (
    <Hydrated fallback={<DemoSkeleton />}>
      <DemoIncidents incidents={data.incidents} now={new Date(data.generatedAt).getTime()} />
    </Hydrated>
  );
}
