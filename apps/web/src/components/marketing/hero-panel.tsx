import { Sparkline } from "@/components/charts/sparkline";
import { UptimeBars } from "@/components/charts/uptime-bars";
import type { DemoDataset, DemoHealth } from "@/lib/demo/fixtures";
import { formatDuration, formatMs, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const HEALTH: Record<DemoHealth, { label: string; dot: string; text: string }> = {
  operational: { label: "Up", dot: "bg-success", text: "text-success" },
  degraded: { label: "Slow", dot: "bg-warning", text: "text-warning" },
  down: { label: "Down", dot: "bg-destructive", text: "text-destructive" },
  paused: { label: "Paused", dot: "bg-paused", text: "text-muted-foreground" },
};

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Landing-page product panel, rendered on the server from the public demo dataset (generated
 * sample data, never real monitoring) and labelled as such. Only durations are shown, so the
 * output does not depend on the visitor's timezone.
 */
export function HeroPanel({ data }: { data: DemoDataset }) {
  const { monitors, summary } = data;
  const degraded = monitors.filter((m) => m.health === "degraded").length;
  const operational = monitors.filter((m) => m.health === "operational").length;
  const down = monitors.find((m) => m.health === "down");
  const openIncident = down ? data.incidents.find((i) => i.monitorId === down.id && i.resolvedAt === null) : undefined;
  const openFor = openIncident ? (Date.parse(data.generatedAt) - Date.parse(openIncident.startedAt)) / 1000 : null;
  const featured = down ?? monitors[0]!;
  const featuredDaily = data.stats[featured.id]?.["30d"].daily ?? [];

  return (
    <div className="relative min-w-0">
      <div className="sx-tilt overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/10 dark:shadow-black/50">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-sm">
          <span className="font-medium">Acme Inc.</span>
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">Sample data</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{summary.totals.monitors} monitors</span>
        </div>

        <dl className="grid grid-cols-3 divide-x border-b">
          {[
            { label: "Operational", value: operational, cls: "text-success" },
            { label: "Degraded", value: degraded, cls: "text-warning" },
            { label: "Down", value: summary.totals.down, cls: "text-destructive" },
          ].map((s) => (
            <div key={s.label} className="px-4 py-3">
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{s.label}</dt>
              <dd className={cn("tabular mt-0.5 text-2xl font-semibold tracking-tight", s.cls)}>{s.value}</dd>
            </div>
          ))}
        </dl>

        <ul className="divide-y" aria-label="Sample monitors">
          {monitors.map((m) => {
            const h = HEALTH[m.health];
            return (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto] sm:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn("size-2 shrink-0 rounded-full", h.dot)} aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{hostOf(m.url)}</div>
                  </div>
                </div>
                {m.health === "paused" ? (
                  <span className="hidden sm:block" aria-hidden />
                ) : (
                  <Sparkline values={m.sparkline} label={`${m.name} response time, last 24 hours`} className="hidden h-7 w-28 sm:block" />
                )}
                <span className={cn("tabular w-14 text-right font-mono text-xs", h.text)}>{m.health === "paused" ? "paused" : formatPercent(m.stats24h.uptime, 1)}</span>
                <span className="tabular w-14 text-right font-mono text-xs text-muted-foreground">{m.health === "paused" ? "—" : formatMs(m.stats24h.avgResponseTimeMs)}</span>
              </li>
            );
          })}
        </ul>

        <div className="border-t px-4 pt-3 pb-4">
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="font-medium">{featured.name}</span>
            <span className="text-muted-foreground">daily uptime, last 30 days</span>
          </div>
          <UptimeBars days={featuredDaily} />
        </div>
      </div>

      {down && openIncident && (
        <div
          role="note"
          aria-label="Sample incident"
          className="relative mt-3 rounded-xl border bg-popover p-3.5 text-sm shadow-xl shadow-black/10 lg:absolute lg:-bottom-[4.25rem] lg:-left-10 lg:mt-0 lg:w-[22rem] dark:shadow-black/50"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-destructive">DOWN</span>
            <span className="truncate font-medium">{down.name} is not responding</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {openIncident.cause}. Confirmed after {down.failureThreshold} consecutive failed checks
            {openFor !== null && <> · open {formatDuration(openFor)}</>}.
          </p>
        </div>
      )}
    </div>
  );
}
