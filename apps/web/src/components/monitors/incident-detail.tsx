"use client";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/app/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useIncident } from "@/lib/client/queries";
import { useNow } from "@/lib/client/use-now";
import { cn } from "@/lib/utils";
import { CheckRows } from "./checks-table";
import { IncidentStateBadge } from "./incident-list";
import { NotificationStatusBadge } from "./notification-status";

export function IncidentDetail({ id }: { id: string }) {
  const q = useIncident(id);
  const now = useNow(5_000);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const i = q.data;
  if (!i) return <Skeleton className="h-96 w-full" />;
  const open = i.resolvedAt === null;
  const duration = open ? (now - new Date(i.startedAt).getTime()) / 1000 : i.durationSeconds;

  const timeline = [
    { at: i.startedAt, label: "Outage started", detail: "First failed check of the streak", tone: "bad" as const },
    ...i.notifications.map((n) => ({
      at: n.sentAt ?? n.createdAt,
      label: n.type === "INCIDENT_OPENED" ? "Downtime alert" : "Recovery alert",
      detail: `${n.status.toLowerCase()} → ${n.recipient}${n.attempts > 1 ? ` (${n.attempts} attempts)` : ""}`,
      tone: "info" as const,
    })),
    ...(i.resolvedAt ? [{ at: i.resolvedAt, label: "Recovered", detail: "First successful check of the confirmed recovery", tone: "good" as const }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="space-y-6">
      <div>
        <Link href="/incidents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Incidents
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/monitors/${i.monitor.id}`} className="hover:underline">
              {i.monitor.name}
            </Link>{" "}
            outage
          </h1>
          <IncidentStateBadge open={open} />
        </div>
        <p className="mt-1 font-mono text-sm break-all text-muted-foreground">{i.monitor.url}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 p-4 shadow-none">
          <div className="text-xs text-muted-foreground uppercase">Started</div>
          <div className="tabular font-medium">{formatDateTime(i.startedAt)}</div>
        </Card>
        <Card className="gap-1 p-4 shadow-none">
          <div className="text-xs text-muted-foreground uppercase">Resolved</div>
          <div className="tabular font-medium">{open ? "Ongoing" : formatDateTime(i.resolvedAt)}</div>
        </Card>
        <Card className="gap-1 p-4 shadow-none">
          <div className="text-xs text-muted-foreground uppercase">Duration</div>
          <div className={cn("tabular font-medium", open && "text-destructive")}>
            {formatDuration(duration)}
            {open && " so far"}
          </div>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Failure reason</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{i.cause}</p>
          <p className="text-xs text-muted-foreground">
            {i.errorType && <span className="font-mono">{i.errorType}</span>}
            {i.statusCode !== null && ` · HTTP ${i.statusCode}`}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
            <CardDescription>Outage and alert delivery events</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-5 border-l pl-5">
              {timeline.map((e, idx) => (
                <li key={idx} className="relative">
                  <span
                    className={cn(
                      "absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-card",
                      e.tone === "bad" ? "bg-destructive" : e.tone === "good" ? "bg-success" : "bg-info",
                    )}
                  />
                  <div className="text-sm font-medium">{e.label}</div>
                  <div className="tabular text-xs text-muted-foreground">{formatDateTime(e.at)}</div>
                  <div className="text-xs text-muted-foreground">{e.detail}</div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4" /> Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {i.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notifications were generated for this incident.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {i.notifications.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{n.type === "INCIDENT_OPENED" ? "Downtime alert" : "Recovery alert"}</span>
                      <span className="truncate text-muted-foreground">{n.recipient}</span>
                      <NotificationStatusBadge status={n.status} />
                      {n.lastError && <span className="w-full text-xs text-muted-foreground">{n.lastError}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-medium">Checks during this incident</h2>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Result</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <CheckRows checks={i.checks} />
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
