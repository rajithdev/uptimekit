"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatCard } from "@/components/app/stat-card";
import { uptimeColor } from "@/components/app/status";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { UptimeBars } from "@/components/charts/uptime-bars";
import { CheckRows } from "@/components/monitors/checks-table";
import { IncidentList } from "@/components/monitors/incident-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SegmentedControl } from "@/components/app/segmented-control";
import type { CheckDto, IncidentDto, MonitorStatsDto } from "@/lib/api/types";
import type { DemoMonitor } from "@/lib/demo/fixtures";
import { formatDuration, formatInterval, formatMs, formatPercent, relativeTime } from "@/lib/format";
import { DemoHealthBadge } from "./health-badge";

type Range = "24h" | "7d" | "30d";

export function DemoMonitorDetail({
  monitor: m,
  stats,
  checks,
  incidents,
  now,
}: {
  monitor: DemoMonitor;
  stats: Record<Range, MonitorStatsDto>;
  checks: CheckDto[];
  incidents: IncidentDto[];
  now: number;
}) {
  const [range, setRange] = useState<Range>("24h");
  const s = stats[range];
  return (
    <div className="space-y-6">
      <div>
        <Link href="/demo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Dashboard
        </Link>
        <div className="mt-3 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{m.name}</h1>
            <DemoHealthBadge health={m.health} status={m.status} />
          </div>
          <p className="font-mono text-sm break-all text-muted-foreground">
            {m.method} {m.url}
          </p>
          <p className="text-xs text-muted-foreground">
            Every {formatInterval(m.intervalSeconds)} · timeout {formatMs(m.timeoutMs)} · expects {m.expectedStatusCodes}
            {m.keyword ? ` · keyword “${m.keyword}”` : ""} · DOWN after {m.failureThreshold} failures, UP after {m.recoveryThreshold} successes
          </p>
          <p className="text-sm text-muted-foreground">{m.description}</p>
        </div>
      </div>

      {m.status === "DOWN" && m.lastError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">Currently down.</span> <span className="text-muted-foreground">{m.lastError}</span>
        </div>
      )}
      {m.status === "PAUSED" && (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Paused {relativeTime(m.pausedAt, now)}. Paused time produces no checks and is excluded from uptime.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl label="Time range" value={range} onChange={setRange} options={[{ value: "24h", label: "24 hours" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />
        <span className="text-xs text-muted-foreground">Last checked {relativeTime(m.lastCheckedAt, now)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Uptime"
          value={formatPercent(s.uptime, 3)}
          valueClassName={uptimeColor(s.uptime)}
          hint={`${s.upChecks.toLocaleString()} of ${s.totalChecks.toLocaleString()} checks · ${s.coverage === null ? "no" : Math.round(s.coverage * 100) + "%"} coverage`}
        />
        <StatCard
          label="Avg response"
          value={formatMs(s.latency.avg)}
          hint={s.latency.p95 !== null ? `p95 ${formatMs(s.latency.p95)} · p50 ${formatMs(s.latency.p50)}` : `min ${formatMs(s.latency.min)} · max ${formatMs(s.latency.max)}`}
        />
        <StatCard label="Incidents" value={s.incidents.count} hint={`in the last ${range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days"}`} />
        <StatCard label="Downtime" value={formatDuration(s.incidents.downtimeSeconds)} valueClassName={s.incidents.downtimeSeconds > 0 ? "text-destructive" : undefined} hint="Confirmed outages only" />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Response time</CardTitle>
          <CardDescription>{range === "24h" ? "15-minute averages" : range === "7d" ? "Hourly averages" : "6-hour averages"} · sample data</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponseTimeChart data={s.series} />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Uptime history</CardTitle>
          <CardDescription>Daily uptime over the last 30 days. Grey days had no checks.</CardDescription>
        </CardHeader>
        <CardContent>
          <UptimeBars days={s.daily} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Recent checks</h2>
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
                <CheckRows checks={checks.slice(0, 15)} />
              </TableBody>
            </Table>
          </div>
        </div>
        <div id="incidents" className="min-w-0 scroll-mt-20">
          <h2 className="mb-3 text-sm font-medium">Incidents &amp; recoveries</h2>
          <div className="rounded-xl border bg-card px-3">
            {incidents.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No incidents in the last 30 days.</p>
            ) : (
              <IncidentList incidents={incidents} showMonitor={false} hrefTemplate="/demo/monitors/{monitorId}#incidents" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
