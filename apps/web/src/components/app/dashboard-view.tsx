"use client";
import { Activity, AlertTriangle, CheckCircle2, Gauge, Plus, Timer } from "lucide-react";
import Link from "next/link";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { MonitorCard } from "@/components/monitors/monitor-card";
import { IncidentList } from "@/components/monitors/incident-list";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMs, formatPercent } from "@/lib/format";
import { useDashboard, useMonitors } from "@/lib/client/queries";
import { EmptyState, ErrorState } from "./empty-state";
import { PageHeader } from "./page-header";
import { StatCard } from "./stat-card";
import { uptimeColor } from "./status";

export function DashboardView() {
  const summary = useDashboard();
  const monitors = useMonitors({ pageSize: 12, sort: "status", order: "asc" });
  const s = summary.data;

  if (summary.error) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;

  const noMonitors = s && s.totals.monitors === 0;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          s ? (
            s.totals.down > 0 ? (
              <span className="text-destructive">
                {s.totals.down} monitor{s.totals.down > 1 ? "s are" : " is"} down
              </span>
            ) : s.totals.monitors > 0 ? (
              "All active monitors are operational"
            ) : (
              "Overview of your monitors"
            )
          ) : (
            "Overview of your monitors"
          )
        }
      />

      {noMonitors ? (
        <EmptyState
          icon={<Activity />}
          title="No monitors yet"
          description="Add a website or API endpoint and UptimeKit will start checking it from the background worker."
          action={
            <Button asChild>
              <Link href="/monitors/new">
                <Plus className="size-4" /> Create your first monitor
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 max-md:[&>*:last-child]:col-span-2">
            <StatCard label="Monitors" icon={<Activity />} loading={!s} value={s?.totals.monitors} hint={s && `${s.totals.paused} paused · ${s.totals.pending + s.totals.unknown} pending`} />
            <StatCard label="Operational" icon={<CheckCircle2 />} loading={!s} value={s?.totals.up} valueClassName="text-success" />
            <StatCard label="Down" icon={<AlertTriangle />} loading={!s} value={s?.totals.down} valueClassName={s && s.totals.down > 0 ? "text-destructive" : undefined} hint={s && `${s.openIncidents} open incident${s.openIncidents === 1 ? "" : "s"}`} />
            <StatCard label="Uptime 24h" icon={<Gauge />} loading={!s} value={formatPercent(s?.averageUptime24h ?? null)} valueClassName={uptimeColor(s?.averageUptime24h ?? null)} hint={s && `avg of monitors · ${s.checksLast24h.toLocaleString()} checks`} />
            <StatCard label="Response 24h" icon={<Timer />} loading={!s} value={formatMs(s?.averageResponseTimeMs24h)} hint="mean of all checks" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="min-w-0 shadow-none xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Response time</CardTitle>
                <CardDescription>Average across all monitors, hourly, last 24 hours</CardDescription>
              </CardHeader>
              <CardContent>{s ? <ResponseTimeChart data={s.responseTimeSeries} height={220} /> : <Skeleton className="h-[220px] w-full" />}</CardContent>
            </Card>
            <Card className="min-w-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Recent incidents</CardTitle>
                <CardDescription>{s ? `${s.incidentsLast24h} in the last 24 hours` : "\u00a0"}</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/incidents">View all</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {!s ? (
                  <Skeleton className="h-40 w-full" />
                ) : s.recentIncidents.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No incidents recorded. </p>
                ) : (
                  <IncidentList incidents={s.recentIncidents} />
                )}
              </CardContent>
            </Card>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Monitors</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/monitors">Manage</Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {monitors.data
                ? monitors.data.data.map((m) => <MonitorCard key={m.id} monitor={m} />)
                : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
