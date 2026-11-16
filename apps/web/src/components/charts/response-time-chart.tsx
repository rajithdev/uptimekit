"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMs } from "@/lib/format";

export interface LatencyPoint {
  t: string;
  avgResponseTimeMs: number | null;
  minResponseTimeMs?: number | null;
  maxResponseTimeMs?: number | null;
  upChecks?: number;
  downChecks?: number;
}

function tickTime(iso: string, spanHours: number) {
  const d = new Date(iso);
  return spanHours > 48
    ? d.toLocaleDateString("en", { month: "short", day: "numeric" })
    : d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: LatencyPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{new Date(p.t).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      {p.avgResponseTimeMs === null ? (
        <div className="text-muted-foreground">No checks recorded</div>
      ) : (
        <dl className="tabular grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-muted-foreground">
          <dt>Average</dt>
          <dd className="text-right text-foreground">{formatMs(p.avgResponseTimeMs)}</dd>
          {p.minResponseTimeMs != null && (
            <>
              <dt>Min / Max</dt>
              <dd className="text-right text-foreground">
                {formatMs(p.minResponseTimeMs)} / {formatMs(p.maxResponseTimeMs)}
              </dd>
            </>
          )}
          {p.upChecks !== undefined && (
            <>
              <dt>Checks</dt>
              <dd className="text-right text-foreground">
                {p.upChecks} up{p.downChecks ? ` · ${p.downChecks} down` : ""}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/** Response time over time (single series, one axis). Empty buckets render as gaps. */
export function ResponseTimeChart({ data, height = 240 }: { data: LatencyPoint[]; height?: number }) {
  const spanHours = data.length > 1 ? (new Date(data.at(-1)!.t).getTime() - new Date(data[0]!.t).getTime()) / 3600_000 : 0;
  const hasData = data.some((d) => d.avgResponseTimeMs !== null);
  if (!hasData) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground" style={{ height }}>
        No response time data recorded in this period yet.
      </div>
    );
  }
  return (
    <div style={{ height }} role="img" aria-label="Response time chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="t"
            tickFormatter={(v: string) => tickTime(v, spanHours)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            width={48}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}s` : `${v}ms`)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="avgResponseTimeMs"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#latencyFill)"
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              // A bucket with no neighbours draws no line segment; show it as a dot so data is never invisible.
              const i = props.index ?? 0;
              const isolated = data[i]?.avgResponseTimeMs != null && data[i - 1]?.avgResponseTimeMs == null && data[i + 1]?.avgResponseTimeMs == null;
              return isolated && props.cx != null && props.cy != null ? (
                <circle key={i} cx={props.cx} cy={props.cy} r={3} fill="var(--chart-2)" />
              ) : (
                <g key={i} />
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
