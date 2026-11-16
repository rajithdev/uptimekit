import { StatusBadge } from "@/components/app/status";
import type { DemoHealth } from "@/lib/demo/fixtures";
import type { MonitorStatus } from "@/lib/api/types";

/**
 * The product's status model is UP / DOWN / PAUSED / PENDING / UNKNOWN. "Degraded" is shown in
 * the demo for a monitor that is UP but slow and flapping, using the same badge styling.
 */
export function DemoHealthBadge({ health, status }: { health: DemoHealth; status: MonitorStatus }) {
  if (health !== "degraded") return <StatusBadge status={status} />;
  return (
    <span data-status="DEGRADED" className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/30 ring-inset">
      <span className="relative inline-flex size-2 rounded-full bg-warning" aria-hidden />
      Degraded
    </span>
  );
}
