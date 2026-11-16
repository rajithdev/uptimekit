import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { StatusBadge, uptimeColor } from "@/components/app/status";
import { formatMs, formatPercent, hostOf, relativeTime } from "@/lib/format";
import type { MonitorListItemDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function MonitorCard({ monitor, href, badge }: { monitor: MonitorListItemDto; href?: string; badge?: React.ReactNode }) {
  return (
    <Link
      href={href ?? `/monitors/${monitor.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20",
        monitor.status === "DOWN" && "border-destructive/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{monitor.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{hostOf(monitor.url)}</div>
        </div>
        {badge ?? <StatusBadge status={monitor.status} stale={monitor.isStale} />}
      </div>
      <Sparkline values={monitor.sparkline} label={`${monitor.name} response time, last 24 hours`} />
      <div className="tabular grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Uptime 24h</div>
          <div className={cn("font-medium", uptimeColor(monitor.stats24h.uptime))}>{formatPercent(monitor.stats24h.uptime)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg response</div>
          <div className="font-medium">{formatMs(monitor.stats24h.avgResponseTimeMs)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Last check</div>
          <div className="font-medium">{monitor.status === "PAUSED" ? "Paused" : relativeTime(monitor.lastCheckedAt)}</div>
        </div>
      </div>
    </Link>
  );
}
