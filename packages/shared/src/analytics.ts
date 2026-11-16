/**
 * Uptime & latency analytics.
 *
 * Definitions (documented in docs/MONITORING.md):
 *  - Uptime % = successful checks / (successful + failed checks) in the window.
 *  - Paused periods produce no checks and are excluded from numerator and denominator.
 *  - Missing checks are NEVER counted as up. With zero recorded checks, uptime is `null`
 *    ("no data") rather than 100%.
 *  - Coverage = recorded checks / expected checks for the time the monitor was active,
 *    capped at 1. It tells the reader how much the uptime number can be trusted.
 *  - Downtime = total duration of confirmed incidents overlapping the window, clipped to it.
 */

export const STATS_RANGES = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

export type StatsRange = keyof typeof STATS_RANGES;

export function uptimePercentage(upChecks: number, downChecks: number): number | null {
  const total = upChecks + downChecks;
  if (total <= 0) return null;
  return round((upChecks / total) * 100, 3);
}

/** Number of checks we would expect for an active monitor over [start, end). */
export function expectedCheckCount(
  windowStart: Date,
  windowEnd: Date,
  intervalSeconds: number,
  activeSince: Date,
  activeUntil: Date | null = null,
): number {
  const start = Math.max(windowStart.getTime(), activeSince.getTime());
  const end = Math.min(windowEnd.getTime(), activeUntil ? activeUntil.getTime() : windowEnd.getTime());
  if (end <= start || intervalSeconds <= 0) return 0;
  return Math.floor((end - start) / (intervalSeconds * 1000));
}

export function coverageRatio(recorded: number, expected: number): number | null {
  if (expected <= 0) return recorded > 0 ? 1 : null;
  return round(Math.min(1, recorded / expected), 4);
}

export interface LatencySummary {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
}

/** Nearest-rank percentile on an ascending-sorted array. */
export function percentile(sortedAsc: readonly number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.ceil((clamped / 100) * sortedAsc.length);
  return sortedAsc[Math.max(0, rank - 1)] ?? null;
}

export function summarizeLatency(samples: readonly number[]): LatencySummary {
  const values = samples.filter((n) => Number.isFinite(n) && n >= 0);
  if (values.length === 0) {
    return { count: 0, avg: null, min: null, max: null, p50: null, p95: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

export interface RollupLike {
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  responseTimeSumMs: number | bigint;
  responseTimeCount: number;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
}

export interface MergedRollup {
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  avgResponseTimeMs: number | null;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
}

export function mergeRollups(rollups: readonly RollupLike[]): MergedRollup {
  let total = 0;
  let up = 0;
  let down = 0;
  let sum = 0;
  let count = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const r of rollups) {
    total += r.totalChecks;
    up += r.upChecks;
    down += r.downChecks;
    sum += Number(r.responseTimeSumMs);
    count += r.responseTimeCount;
    if (r.minResponseTimeMs !== null) min = min === null ? r.minResponseTimeMs : Math.min(min, r.minResponseTimeMs);
    if (r.maxResponseTimeMs !== null) max = max === null ? r.maxResponseTimeMs : Math.max(max, r.maxResponseTimeMs);
  }
  return {
    totalChecks: total,
    upChecks: up,
    downChecks: down,
    avgResponseTimeMs: count > 0 ? Math.round(sum / count) : null,
    minResponseTimeMs: min,
    maxResponseTimeMs: max,
  };
}

export interface IncidentSpan {
  startedAt: Date;
  resolvedAt: Date | null;
}

/** Total seconds of incident time inside [windowStart, windowEnd]. Open incidents run to `now`. */
export function downtimeSeconds(
  incidents: readonly IncidentSpan[],
  windowStart: Date,
  windowEnd: Date,
  now: Date = windowEnd,
): number {
  // Merge overlapping spans so concurrent records are never double counted.
  const spans = incidents
    .map((i) => [
      Math.max(i.startedAt.getTime(), windowStart.getTime()),
      Math.min((i.resolvedAt ?? now).getTime(), windowEnd.getTime()),
    ])
    .filter(([s, e]) => (e as number) > (s as number))
    .sort((a, b) => (a[0] as number) - (b[0] as number)) as [number, number][];

  let totalMs = 0;
  let curStart: number | null = null;
  let curEnd = 0;
  for (const [s, e] of spans) {
    if (curStart === null) {
      curStart = s;
      curEnd = e;
    } else if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      totalMs += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  if (curStart !== null) totalMs += curEnd - curStart;
  return Math.round(totalMs / 1000);
}

export function durationSecondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

export function startOfHourUtc(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCMinutes(0, 0, 0);
  return d;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
