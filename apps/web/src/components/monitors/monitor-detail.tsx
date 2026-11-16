"use client";
import { ArrowLeft, ExternalLink, Pause, Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge, uptimeColor } from "@/components/app/status";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { UptimeBars } from "@/components/charts/uptime-bars";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration, formatInterval, formatMs, formatPercent, relativeTime } from "@/lib/format";
import { useDeleteMonitor, useIncidents, useMonitor, useMonitorStats, usePauseResume } from "@/lib/client/queries";
import { ChecksTable } from "./checks-table";
import { IncidentList } from "./incident-list";

type Range = "24h" | "7d" | "30d";

export function MonitorDetail({ id }: { id: string }) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("24h");
  const monitor = useMonitor(id);
  const stats = useMonitorStats(id, range);
  const incidents = useIncidents({ page: 1, pageSize: 5, monitorId: id });
  const pauseResume = usePauseResume();
  const del = useDeleteMonitor();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (monitor.error) return <ErrorState error={monitor.error} onRetry={() => monitor.refetch()} />;
  const m = monitor.data;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/monitors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Monitors
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            {m ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{m.name}</h1>
                  <StatusBadge status={m.status} stale={m.isStale} />
                </div>
                <a href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 font-mono text-sm break-all text-muted-foreground hover:text-foreground">
                  {m.method} {m.url} <ExternalLink className="size-3 shrink-0" />
                </a>
                <p className="text-xs text-muted-foreground">
                  Every {formatInterval(m.intervalSeconds)} · timeout {formatMs(m.timeoutMs)} · expects {m.expectedStatusCodes}
                  {m.keyword ? ` · keyword “${m.keyword}”` : ""} · DOWN after {m.failureThreshold} failure{m.failureThreshold > 1 ? "s" : ""}, UP after {m.recoveryThreshold} success
                  {m.recoveryThreshold > 1 ? "es" : ""}
                </p>
              </>
            ) : (
              <Skeleton className="h-16 w-80" />
            )}
          </div>
          {m && (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" disabled={pauseResume.isPending} onClick={() => pauseResume.mutate({ id, action: m.status === "PAUSED" ? "resume" : "pause" })}>
                {m.status === "PAUSED" ? <Play className="size-4" /> : <Pause className="size-4" />}
                {m.status === "PAUSED" ? "Resume" : "Pause"}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/monitors/${id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} aria-label="Delete monitor">
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {m?.status === "DOWN" && m.lastError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">Currently down.</span> <span className="text-muted-foreground">{m.lastError}</span>
        </div>
      )}
      {m?.isStale && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
          No check has completed for {m.lastCheckedAt ? relativeTime(m.lastCheckedAt).replace(" ago", "") : "a while"}. Is the worker running?
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="24h">24 hours</TabsTrigger>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-muted-foreground">{m?.lastCheckedAt ? `Last checked ${relativeTime(m.lastCheckedAt)}` : "Awaiting first check"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Uptime"
          loading={!s}
          value={formatPercent(s?.uptime ?? null, 3)}
          valueClassName={uptimeColor(s?.uptime ?? null)}
          hint={s && `${s.upChecks.toLocaleString()} of ${s.totalChecks.toLocaleString()} checks · ${s.coverage === null ? "no" : Math.round(s.coverage * 100) + "%"} coverage`}
        />
        <StatCard label="Avg response" loading={!s} value={formatMs(s?.latency.avg)} hint={s && (s.latency.p95 !== null ? `p95 ${formatMs(s.latency.p95)} · p50 ${formatMs(s.latency.p50)}` : `min ${formatMs(s.latency.min)} · max ${formatMs(s.latency.max)}`)} />
        <StatCard label="Incidents" loading={!s} value={s?.incidents.count} hint={s && `in the last ${range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days"}`} />
        <StatCard label="Downtime" loading={!s} value={formatDuration(s?.incidents.downtimeSeconds ?? null)} valueClassName={s && s.incidents.downtimeSeconds > 0 ? "text-destructive" : undefined} hint="Confirmed outages only" />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Response time</CardTitle>
          <CardDescription>
            {range === "24h" ? "15-minute averages from raw checks" : range === "7d" ? "Hourly averages" : "6-hour averages"} · time to response headers incl. DNS, TCP and TLS
          </CardDescription>
        </CardHeader>
        <CardContent>{s ? <ResponseTimeChart data={s.series} /> : <Skeleton className="h-[240px] w-full" />}</CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Uptime history</CardTitle>
          <CardDescription>Daily uptime over the last 30 days (UTC). Grey days had no recorded checks.</CardDescription>
        </CardHeader>
        <CardContent>{s ? <UptimeBars days={s.daily} /> : <Skeleton className="h-9 w-full" />}</CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChecksTable monitorId={id} />
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Incidents</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/incidents?monitorId=${id}`}>View all</Link>
            </Button>
          </div>
          <div className="rounded-xl border bg-card px-3">
            {!incidents.data ? (
              <Skeleton className="my-3 h-20 w-full" />
            ) : incidents.data.data.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No incidents recorded.</p>
            ) : (
              <IncidentList incidents={incidents.data.data} showMonitor={false} />
            )}
          </div>
        </div>
      </div>

      {m && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${m.name}?`}
          description="This permanently deletes the monitor with its check history, incidents and alert log. This cannot be undone."
          confirmLabel="Delete monitor"
          destructive
          onConfirm={() => del.mutate(id, { onSuccess: () => router.push("/monitors") })}
        />
      )}
    </div>
  );
}
