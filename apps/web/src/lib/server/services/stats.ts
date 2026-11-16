import "server-only";
import {
  STATS_RANGES,
  coverageRatio,
  downtimeSeconds,
  expectedCheckCount,
  mergeRollups,
  summarizeLatency,
  uptimePercentage,
  type StatsRange,
} from "@uptimekit/shared";
import type { DashboardSummaryDto, MonitorStatsDto, SeriesPoint } from "../../api/types";
import { db } from "../db";
import { getOwnedMonitor } from "./monitors";
import { toIncidentDto } from "./serializers";

const BUCKETS: Record<StatsRange, number> = { "24h": 15 * 60, "7d": 3600, "30d": 6 * 3600 };

interface BucketRow {
  bucket: Date;
  up: bigint | number;
  down: bigint | number;
  rt_sum: bigint | number | null;
  rt_count: bigint | number;
  rt_min: number | null;
  rt_max: number | null;
}

function toSeries(rows: BucketRow[], windowStart: Date, windowEnd: Date, bucketSeconds: number): SeriesPoint[] {
  const byTime = new Map(rows.map((r) => [r.bucket.getTime(), r]));
  const points: SeriesPoint[] = [];
  const step = bucketSeconds * 1000;
  const first = Math.floor(windowStart.getTime() / step) * step;
  for (let t = first; t < windowEnd.getTime(); t += step) {
    const r = byTime.get(t);
    const up = Number(r?.up ?? 0);
    const down = Number(r?.down ?? 0);
    const count = Number(r?.rt_count ?? 0);
    points.push({
      t: new Date(t).toISOString(),
      avgResponseTimeMs: count > 0 ? Math.round(Number(r!.rt_sum) / count) : null,
      minResponseTimeMs: r?.rt_min ?? null,
      maxResponseTimeMs: r?.rt_max ?? null,
      upChecks: up,
      downChecks: down,
      uptime: uptimePercentage(up, down),
    });
  }
  return points;
}

/**
 * Monitor statistics for a window.
 *  - 24h uses raw checks (exact boundaries, true percentiles).
 *  - 7d / 30d use hourly rollups (hour-granular boundaries; p50/p95 not available).
 */
export async function getMonitorStats(userId: string, monitorId: string, range: StatsRange): Promise<MonitorStatsDto> {
  const monitor = await getOwnedMonitor(userId, monitorId);
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - STATS_RANGES[range]);
  const bucketSeconds = BUCKETS[range];
  const origin = new Date(0);

  let up = 0;
  let down = 0;
  let latency: MonitorStatsDto["latency"];
  let series: SeriesPoint[];
  let source: MonitorStatsDto["source"];

  if (range === "24h") {
    source = "checks";
    const [samples, buckets] = await Promise.all([
      db().check.findMany({
        where: { monitorId, checkedAt: { gte: windowStart } },
        select: { result: true, responseTimeMs: true },
      }),
      db().$queryRaw<BucketRow[]>`
        SELECT date_bin(make_interval(secs => ${bucketSeconds}), checked_at, ${origin}::timestamptz) AS bucket,
               COUNT(*) FILTER (WHERE result = 'UP') AS up,
               COUNT(*) FILTER (WHERE result = 'DOWN') AS down,
               SUM(response_time_ms) AS rt_sum,
               COUNT(response_time_ms) AS rt_count,
               MIN(response_time_ms) AS rt_min,
               MAX(response_time_ms) AS rt_max
        FROM checks WHERE monitor_id = ${monitorId} AND checked_at >= ${windowStart}
        GROUP BY 1 ORDER BY 1`,
    ]);
    for (const s of samples) {
      if (s.result === "UP") up++;
      else down++;
    }
    const summary = summarizeLatency(samples.map((s) => s.responseTimeMs).filter((n): n is number => n !== null));
    latency = { avg: summary.avg, min: summary.min, max: summary.max, p50: summary.p50, p95: summary.p95 };
    series = toSeries(buckets, windowStart, windowEnd, bucketSeconds);
  } else {
    source = "rollups";
    const hourFloor = new Date(Math.floor(windowStart.getTime() / 3600_000) * 3600_000);
    const [rollups, buckets] = await Promise.all([
      db().checkRollupHourly.findMany({ where: { monitorId, hour: { gte: hourFloor } } }),
      db().$queryRaw<BucketRow[]>`
        SELECT date_bin(make_interval(secs => ${bucketSeconds}), hour, ${origin}::timestamptz) AS bucket,
               SUM(up_checks) AS up, SUM(down_checks) AS down,
               SUM(response_time_sum_ms) AS rt_sum, SUM(response_time_count) AS rt_count,
               MIN(min_response_time_ms) AS rt_min, MAX(max_response_time_ms) AS rt_max
        FROM check_rollups_hourly WHERE monitor_id = ${monitorId} AND hour >= ${hourFloor}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const merged = mergeRollups(rollups);
    up = merged.upChecks;
    down = merged.downChecks;
    latency = { avg: merged.avgResponseTimeMs, min: merged.minResponseTimeMs, max: merged.maxResponseTimeMs, p50: null, p95: null };
    series = toSeries(buckets, windowStart, windowEnd, bucketSeconds);
  }

  const [incidents, daily] = await Promise.all([
    db().incident.findMany({
      where: { monitorId, startedAt: { lt: windowEnd }, OR: [{ resolvedAt: null }, { resolvedAt: { gt: windowStart } }] },
      select: { startedAt: true, resolvedAt: true },
    }),
    dailyUptime(monitorId, 30),
  ]);

  const expected = expectedCheckCount(windowStart, windowEnd, monitor.intervalSeconds, monitor.createdAt, monitor.pausedAt);
  return {
    range,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    source,
    uptime: uptimePercentage(up, down),
    totalChecks: up + down,
    upChecks: up,
    downChecks: down,
    expectedChecks: expected,
    coverage: coverageRatio(up + down, expected),
    latency,
    incidents: {
      count: incidents.filter((i) => i.startedAt >= windowStart).length,
      downtimeSeconds: downtimeSeconds(incidents, windowStart, windowEnd),
    },
    bucketSeconds,
    series,
    daily,
  };
}

async function dailyUptime(monitorId: string, days: number) {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const start = new Date(todayUtc.getTime() - (days - 1) * 86_400_000);
  const rows = await db().$queryRaw<{ day: Date; up: bigint; down: bigint }[]>`
    SELECT date_trunc('day', hour AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
           SUM(up_checks)::bigint AS up, SUM(down_checks)::bigint AS down
    FROM check_rollups_hourly WHERE monitor_id = ${monitorId} AND hour >= ${start}
    GROUP BY 1 ORDER BY 1`;
  const byDay = new Map(rows.map((r) => [r.day.getTime(), r]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    const r = byDay.get(d.getTime());
    const up = Number(r?.up ?? 0);
    const down = Number(r?.down ?? 0);
    return { date: d.toISOString().slice(0, 10), uptime: uptimePercentage(up, down), checks: up + down };
  });
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummaryDto> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const hourStart = new Date(Math.floor(Date.now() / 3600_000) * 3600_000 - 23 * 3600_000);

  const [statusGroups, perMonitor, series, openIncidents, incidentsLast24h, recent] = await Promise.all([
    db().monitor.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    db().$queryRaw<{ monitor_id: string; up: bigint; down: bigint; rt_sum: bigint | null; rt_count: bigint }[]>`
      SELECT c.monitor_id,
             COUNT(*) FILTER (WHERE c.result = 'UP') AS up,
             COUNT(*) FILTER (WHERE c.result = 'DOWN') AS down,
             SUM(c.response_time_ms)::bigint AS rt_sum,
             COUNT(c.response_time_ms) AS rt_count
      FROM checks c JOIN monitors m ON m.id = c.monitor_id
      WHERE m.user_id = ${userId} AND c.checked_at >= ${since}
      GROUP BY c.monitor_id`,
    db().$queryRaw<{ hour: Date; rt_sum: bigint; rt_count: bigint }[]>`
      SELECT r.hour, SUM(r.response_time_sum_ms)::bigint AS rt_sum, SUM(r.response_time_count)::bigint AS rt_count
      FROM check_rollups_hourly r JOIN monitors m ON m.id = r.monitor_id
      WHERE m.user_id = ${userId} AND r.hour >= ${hourStart}
      GROUP BY r.hour ORDER BY r.hour`,
    db().incident.count({ where: { userId, resolvedAt: null } }),
    db().incident.count({ where: { userId, startedAt: { gte: since } } }),
    db().incident.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 6,
      include: { monitor: { select: { id: true, name: true, url: true } } },
    }),
  ]);

  const count = (s: string) => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const uptimes = perMonitor.map((r) => uptimePercentage(Number(r.up), Number(r.down))).filter((u): u is number => u !== null);
  const rtSum = perMonitor.reduce((a, r) => a + Number(r.rt_sum ?? 0), 0);
  const rtCount = perMonitor.reduce((a, r) => a + Number(r.rt_count), 0);
  const byHour = new Map(series.map((s) => [s.hour.getTime(), s]));

  return {
    totals: {
      monitors: statusGroups.reduce((a, g) => a + g._count._all, 0),
      up: count("UP"),
      down: count("DOWN"),
      paused: count("PAUSED"),
      pending: count("PENDING"),
      unknown: count("UNKNOWN"),
    },
    averageUptime24h: uptimes.length ? Math.round((uptimes.reduce((a, b) => a + b, 0) / uptimes.length) * 1000) / 1000 : null,
    averageResponseTimeMs24h: rtCount > 0 ? Math.round(rtSum / rtCount) : null,
    openIncidents,
    incidentsLast24h,
    recentIncidents: recent.map(toIncidentDto),
    responseTimeSeries: Array.from({ length: 24 }, (_, i) => {
      const t = hourStart.getTime() + i * 3600_000;
      const r = byHour.get(t);
      const n = Number(r?.rt_count ?? 0);
      return { t: new Date(t).toISOString(), avgResponseTimeMs: n > 0 ? Math.round(Number(r!.rt_sum) / n) : null };
    }),
    checksLast24h: perMonitor.reduce((a, r) => a + Number(r.up) + Number(r.down), 0),
  };
}
