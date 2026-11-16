import { Activity, AlertTriangle, CheckCircle2, Gauge, Timer } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { uptimeColor } from "@/components/app/status";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { IncidentList } from "@/components/monitors/incident-list";
import { MonitorCard } from "@/components/monitors/monitor-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoDataset } from "@/lib/demo/fixtures";
import { formatMs, formatPercent } from "@/lib/format";
import { DemoHealthBadge } from "./health-badge";

export function DemoDashboard({ data }: { data: DemoDataset }) {
  const s = data.summary;
  const degraded = data.monitors.filter((m) => m.health === "degraded").length;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <span>
            <span className="text-destructive">{s.totals.down} monitor down</span> · {degraded} degraded · sample workspace “Acme Inc.”
          </span>
        }
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Monitors" icon={<Activity />} value={s.totals.monitors} hint={`${s.totals.paused} paused`} />
          <StatCard label="Operational" icon={<CheckCircle2 />} value={s.totals.up} valueClassName="text-success" hint={`${degraded} degraded`} />
          <StatCard label="Down" icon={<AlertTriangle />} value={s.totals.down} valueClassName={s.totals.down ? "text-destructive" : undefined} hint={`${s.openIncidents} open incident${s.openIncidents === 1 ? "" : "s"}`} />
          <StatCard label="Uptime 24h" icon={<Gauge />} value={formatPercent(s.averageUptime24h)} valueClassName={uptimeColor(s.averageUptime24h)} hint={`avg of monitors · ${s.checksLast24h.toLocaleString()} checks`} />
          <StatCard label="Response 24h" icon={<Timer />} value={formatMs(s.averageResponseTimeMs24h)} hint="mean of all checks" />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="min-w-0 shadow-none xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Response time</CardTitle>
              <CardDescription>Average across all monitors, hourly, last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponseTimeChart data={s.responseTimeSeries} height={220} />
            </CardContent>
          </Card>
          <Card className="min-w-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Recent incidents</CardTitle>
              <CardDescription>{s.incidentsLast24h} in the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <IncidentList incidents={s.recentIncidents} hrefTemplate="/demo/monitors/{monitorId}#incidents" />
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="demo-monitors">
          <h2 id="demo-monitors" className="mb-3 text-sm font-medium">
            Monitors
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.monitors.map((m) => (
              <MonitorCard key={m.id} monitor={m} href={`/demo/monitors/${m.id}`} badge={<DemoHealthBadge health={m.health} status={m.status} />} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
