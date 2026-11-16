import { cn } from "@/lib/utils";
import type { MonitorStatus } from "@/lib/api/types";

export const STATUS_META: Record<MonitorStatus, { label: string; dot: string; text: string; ring: string }> = {
  UP: { label: "Operational", dot: "bg-success", text: "text-success", ring: "ring-success/25 bg-success/10" },
  DOWN: { label: "Down", dot: "bg-destructive", text: "text-destructive", ring: "ring-destructive/30 bg-destructive/10" },
  PENDING: { label: "Pending", dot: "bg-info", text: "text-info", ring: "ring-info/25 bg-info/10" },
  PAUSED: { label: "Paused", dot: "bg-paused", text: "text-muted-foreground", ring: "ring-border bg-muted/60" },
  UNKNOWN: { label: "Unknown", dot: "bg-warning", text: "text-warning", ring: "ring-warning/25 bg-warning/10" },
};

export function StatusDot({ status, className }: { status: MonitorStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} aria-hidden>
      {(status === "UP" || status === "DOWN") && (
        <span className={cn("absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping", meta.dot, status === "UP" && "[animation-duration:2.5s]")} />
      )}
      <span className={cn("relative inline-flex size-2.5 rounded-full", meta.dot)} />
    </span>
  );
}

export function StatusBadge({ status, stale = false, className }: { status: MonitorStatus; stale?: boolean; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", meta.ring, meta.text, className)}
      data-status={status}
    >
      <StatusDot status={status} className="size-2" />
      {meta.label}
      {stale && <span className="text-muted-foreground">· stale</span>}
    </span>
  );
}

export function uptimeColor(uptime: number | null): string {
  if (uptime === null) return "text-muted-foreground";
  if (uptime >= 99.5) return "text-success";
  if (uptime >= 95) return "text-warning";
  return "text-destructive";
}
