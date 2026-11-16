"use client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DayUptime {
  date: string;
  uptime: number | null;
  checks: number;
}

function barClass(uptime: number | null) {
  if (uptime === null) return "bg-muted";
  if (uptime >= 99.5) return "bg-success";
  if (uptime >= 95) return "bg-warning";
  return "bg-destructive";
}

function verdict(uptime: number | null) {
  if (uptime === null) return "No data";
  if (uptime >= 99.5) return "Healthy";
  if (uptime >= 95) return "Degraded";
  return "Outage";
}

/** One bar per day. Days without checks are grey ("no data"), never counted as up. */
export function UptimeBars({ days }: { days: DayUptime[] }) {
  return (
    <div>
      <div className="flex h-9 items-stretch gap-[2px]" role="list" aria-label="Daily uptime">
        {days.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                role="listitem"
                aria-label={`${d.date}: ${verdict(d.uptime)} ${d.uptime === null ? "" : formatPercent(d.uptime)}`}
                className={cn("min-w-[3px] flex-1 rounded-[3px] transition-opacity hover:opacity-80", barClass(d.uptime))}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <div className="font-medium">{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</div>
                <div>
                  {verdict(d.uptime)}
                  {d.uptime !== null && ` · ${formatPercent(d.uptime, 3)}`}
                </div>
                <div className="opacity-70">{d.checks.toLocaleString()} checks</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{days.length} days ago</span>
        <span className="hidden items-center gap-3 sm:flex">
          <Legend className="bg-success" label="≥ 99.5%" />
          <Legend className="bg-warning" label="≥ 95%" />
          <Legend className="bg-destructive" label="< 95%" />
          <Legend className="bg-muted" label="No data" />
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-[2px]", className)} />
      {label}
    </span>
  );
}
