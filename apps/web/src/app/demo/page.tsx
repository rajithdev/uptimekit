import { DemoDashboard } from "@/components/demo/demo-dashboard";
import { DemoSkeleton } from "@/components/demo/demo-skeleton";
import { Hydrated } from "@/components/demo/hydrated";
import { buildDemoDataset } from "@/lib/demo/fixtures";

// Regenerated from the fixture generator (no database access) at most every 5 minutes.
export const revalidate = 300;

export default function DemoDashboardPage() {
  return (
    <Hydrated fallback={<DemoSkeleton />}>
      <DemoDashboard data={buildDemoDataset()} />
    </Hydrated>
  );
}
