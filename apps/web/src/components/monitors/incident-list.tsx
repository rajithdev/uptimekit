"use client";
import Link from "next/link";
import { formatDuration, relativeTime } from "@/lib/format";
import type { IncidentDto } from "@/lib/api/types";
import { useNow } from "@/lib/client/use-now";
import { cn } from "@/lib/utils";

export function IncidentStateBadge({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        open ? "bg-destructive/10 text-destructive ring-destructive/30" : "bg-muted/60 text-muted-foreground ring-border",
      )}
    >
      <span className={cn("size-1.5 rounded-full", open ? "bg-destructive" : "bg-success")} />
      {open ? "Ongoing" : "Resolved"}
    </span>
  );
}

export function IncidentList({ incidents, showMonitor = true }: { incidents: IncidentDto[]; showMonitor?: boolean }) {
  const now = useNow();
  return (
    <ul className="divide-y">
      {incidents.map((i) => {
        const open = i.resolvedAt === null;
        const ongoingSeconds = (now - new Date(i.startedAt).getTime()) / 1000;
        return (
          <li key={i.id}>
            <Link href={`/incidents/${i.id}`} className="block space-y-1 rounded-md px-2 py-3 transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <IncidentStateBadge open={open} />
                <span className="tabular shrink-0 text-xs text-muted-foreground">{relativeTime(i.startedAt, now)}</span>
              </div>
              {showMonitor && <div className="truncate text-sm font-medium">{i.monitor.name}</div>}
              <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{i.cause}</span>
                <span className="tabular shrink-0">{open ? `${formatDuration(ongoingSeconds)} so far` : formatDuration(i.durationSeconds)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
