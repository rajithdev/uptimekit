/**
 * Public demo dataset.
 *
 * Everything here is GENERATED SAMPLE DATA for the read-only /demo experience. It is built in
 * memory from a fixed seed, never touches the database, and every page that renders it carries a
 * "sample data" label. Monitor names and URLs are fictional (reserved example.* domains).
 *
 * The generator models each monitor's outages as explicit time windows and derives everything
 * else from them (check counts, uptime, incidents, downtime, daily bars), so the numbers on every
 * demo page are mutually consistent — the same way the real analytics are derived from checks.
 */
import type { CheckDto, DashboardSummaryDto, IncidentDto, MonitorListItemDto, MonitorStatsDto, SeriesPoint } from "../api/types";

export type DemoHealth = "operational" | "degraded" | "down" | "paused";

export interface DemoMonitor extends MonitorListItemDto {
  health: DemoHealth;
  description: string;
}

export interface DemoDataset {
  generatedAt: string;
  monitors: DemoMonitor[];
  incidents: IncidentDto[];
  summary: DashboardSummaryDto;
  stats: Record<string, Record<"24h" | "7d" | "30d", MonitorStatsDto>>;
  checks: Record<string, CheckDto[]>;
}

interface Outage {
  /** minutes before "now" the outage started */
  startAgoMin: number;
  /** duration in minutes; null = ongoing */
  durationMin: number | null;
  cause: string;
  errorType: string;
  statusCode: number | null;
}

interface MonitorSpec {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  intervalSeconds: number;
  health: DemoHealth;
  description: string;
  baseLatencyMs: number;
  jitter: number;
  /** extra latency multiplier during the last N minutes (degradation) */
  slowLastMin?: number;
  slowFactor?: number;
  /** fraction of isolated failed checks (transient, below the confirmation threshold) */
  transientFailureRate?: number;
  outages: Outage[];
  pausedAgoMin?: number;
  createdDaysAgo: number;
}

const DAY = 24 * 60;

const SPECS: MonitorSpec[] = [
  {
    id: "demo-storefront",
    name: "Storefront",
    url: "https://shop.example.com/",
    method: "GET",
    intervalSeconds: 60,
    health: "operational",
    description: "Customer-facing web shop with a keyword check on the product grid.",
    baseLatencyMs: 182,
    jitter: 0.18,
    transientFailureRate: 0.0006,
    outages: [
      { startAgoMin: 9 * DAY + 312, durationMin: 6, cause: "Unexpected HTTP status 502 (expected 200-299)", errorType: "STATUS", statusCode: 502 },
      { startAgoMin: 23 * DAY + 95, durationMin: 3, cause: "Timed out after 10000ms", errorType: "TIMEOUT", statusCode: null },
    ],
    createdDaysAgo: 120,
  },
  {
    id: "demo-payments-api",
    name: "Payments API",
    url: "https://api.payments.example.com/health",
    method: "GET",
    intervalSeconds: 30,
    health: "degraded",
    description: "Elevated latency for the last few hours and intermittent failed checks.",
    baseLatencyMs: 240,
    jitter: 0.25,
    slowLastMin: 5 * 60,
    slowFactor: 3.4,
    transientFailureRate: 0.012,
    outages: [
      { startAgoMin: 3 * 60 + 40, durationMin: 11, cause: "Unexpected HTTP status 503 (expected 200-299)", errorType: "STATUS", statusCode: 503 },
      { startAgoMin: 4 * DAY + 610, durationMin: 18, cause: "Timed out after 8000ms", errorType: "TIMEOUT", statusCode: null },
      { startAgoMin: 17 * DAY + 1200, durationMin: 7, cause: "Unexpected HTTP status 500 (expected 200-299)", errorType: "STATUS", statusCode: 500 },
    ],
    createdDaysAgo: 90,
  },
  {
    id: "demo-auth",
    name: "Auth service",
    url: "https://auth.example.com/healthz",
    method: "GET",
    intervalSeconds: 60,
    health: "operational",
    description: "Identity provider health endpoint.",
    baseLatencyMs: 64,
    jitter: 0.12,
    outages: [],
    createdDaysAgo: 200,
  },
  {
    id: "demo-admin-portal",
    name: "Legacy admin portal",
    url: "https://admin.example.net/",
    method: "GET",
    intervalSeconds: 60,
    health: "down",
    description: "Ongoing outage: the origin is refusing connections.",
    baseLatencyMs: 410,
    jitter: 0.2,
    transientFailureRate: 0.002,
    outages: [
      { startAgoMin: 47, durationMin: null, cause: "Connection failed (ECONNREFUSED)", errorType: "CONNECTION", statusCode: null },
      { startAgoMin: 6 * DAY + 80, durationMin: 42, cause: "TLS error: certificate has expired", errorType: "TLS", statusCode: null },
      { startAgoMin: 12 * DAY + 900, durationMin: 25, cause: "Unexpected HTTP status 503 (expected 200-299)", errorType: "STATUS", statusCode: 503 },
    ],
    createdDaysAgo: 60,
  },
  {
    id: "demo-docs",
    name: "Documentation",
    url: "https://docs.example.org/",
    method: "HEAD",
    intervalSeconds: 300,
    health: "operational",
    description: "Static docs site, checked every 5 minutes with HEAD.",
    baseLatencyMs: 96,
    jitter: 0.15,
    outages: [{ startAgoMin: 27 * DAY + 400, durationMin: 15, cause: "DNS lookup failed (ENOTFOUND)", errorType: "DNS", statusCode: null }],
    createdDaysAgo: 300,
  },
  {
    id: "demo-webhooks",
    name: "Webhook receiver",
    url: "https://hooks.example.com/ping",
    method: "GET",
    intervalSeconds: 60,
    health: "paused",
    description: "Paused for a migration. Paused time is excluded from uptime.",
    baseLatencyMs: 130,
    jitter: 0.15,
    outages: [],
    pausedAgoMin: 2 * DAY + 300,
    createdDaysAgo: 45,
  },
];

/** Small deterministic PRNG (mulberry32) so the demo looks the same for every visitor. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface Ctx {
  nowMs: number;
  spec: MonitorSpec;
}

function outageWindows({ nowMs, spec }: Ctx) {
  return spec.outages.map((o) => ({
    start: nowMs - o.startAgoMin * 60_000,
    end: o.durationMin === null ? nowMs : nowMs - (o.startAgoMin - o.durationMin) * 60_000,
    o,
  }));
}

/** Latency for a point in time (deterministic per bucket). */
function latencyAt(ctx: Ctx, t: number, r: () => number): number {
  const { spec, nowMs } = ctx;
  const hourOfDay = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
  const diurnal = 1 + 0.18 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI); // busier in the day
  let v = spec.baseLatencyMs * diurnal * (1 + (r() - 0.5) * 2 * spec.jitter);
  if (spec.slowLastMin && nowMs - t < spec.slowLastMin * 60_000) {
    const ramp = 1 - (nowMs - t) / (spec.slowLastMin * 60_000); // worse closer to now
    v *= 1 + ((spec.slowFactor ?? 1) - 1) * (0.5 + 0.5 * ramp);
  }
  return Math.max(5, Math.round(v));
}

/** Build one bucket's check counts and latency stats. */
function bucket(ctx: Ctx, startMs: number, endMs: number, r: () => number): SeriesPoint {
  const { spec } = ctx;
  const active = activeOverlap(ctx, startMs, endMs);
  const expected = Math.floor(active / (spec.intervalSeconds * 1000));
  if (expected <= 0) {
    return { t: new Date(startMs).toISOString(), avgResponseTimeMs: null, minResponseTimeMs: null, maxResponseTimeMs: null, upChecks: 0, downChecks: 0, uptime: null };
  }
  let downMs = 0;
  for (const w of outageWindows(ctx)) {
    downMs += Math.max(0, Math.min(endMs, w.end) - Math.max(startMs, w.start));
  }
  let down = Math.round((downMs / active) * expected);
  // transient blips (single failed checks that never become incidents)
  const blips = spec.transientFailureRate ? Math.floor(expected * spec.transientFailureRate + r()) : 0;
  down = Math.min(expected, down + (downMs > 0 ? 0 : blips));
  const up = expected - down;
  const mid = (startMs + endMs) / 2;
  const avg = up > 0 ? latencyAt(ctx, mid, r) : null;
  return {
    t: new Date(startMs).toISOString(),
    avgResponseTimeMs: avg,
    minResponseTimeMs: avg === null ? null : Math.round(avg * (0.62 + r() * 0.1)),
    maxResponseTimeMs: avg === null ? null : Math.round(avg * (1.7 + r() * 0.9)),
    upChecks: up,
    downChecks: down,
    uptime: up + down > 0 ? round3((up / (up + down)) * 100) : null,
  };
}

function activeOverlap({ spec, nowMs }: Ctx, startMs: number, endMs: number): number {
  const createdAt = nowMs - spec.createdDaysAgo * DAY * 60_000;
  const pausedAt = spec.pausedAgoMin !== undefined ? nowMs - spec.pausedAgoMin * 60_000 : Infinity;
  return Math.max(0, Math.min(endMs, pausedAt, nowMs) - Math.max(startMs, createdAt));
}

const RANGES = { "24h": { ms: DAY * 60_000, bucketSec: 15 * 60 }, "7d": { ms: 7 * DAY * 60_000, bucketSec: 3600 }, "30d": { ms: 30 * DAY * 60_000, bucketSec: 6 * 3600 } } as const;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

function statsFor(ctx: Ctx, range: keyof typeof RANGES, incidents: IncidentDto[]): MonitorStatsDto {
  const { ms, bucketSec } = RANGES[range];
  const { nowMs, spec } = ctx;
  const windowStart = nowMs - ms;
  const step = bucketSec * 1000;
  const first = Math.floor(windowStart / step) * step;
  const r = rng(hashSeed(`${spec.id}:${range}`));
  const series: SeriesPoint[] = [];
  for (let t = first; t < nowMs; t += step) series.push(bucket(ctx, Math.max(t, windowStart), Math.min(t + step, nowMs), r));
  const up = series.reduce((a, p) => a + p.upChecks, 0);
  const down = series.reduce((a, p) => a + p.downChecks, 0);
  const lat = series.flatMap((p) => (p.avgResponseTimeMs === null ? [] : [p.avgResponseTimeMs])).sort((a, b) => a - b);
  const weighted = series.reduce((a, p) => a + (p.avgResponseTimeMs ?? 0) * p.upChecks, 0);
  const expected = Math.floor(activeOverlap(ctx, windowStart, nowMs) / (spec.intervalSeconds * 1000));
  const inWindow = incidents.filter((i) => new Date(i.startedAt).getTime() >= windowStart);
  const downtime = incidents.reduce((a, i) => {
    const s = Math.max(new Date(i.startedAt).getTime(), windowStart);
    const e = i.resolvedAt ? new Date(i.resolvedAt).getTime() : nowMs;
    return a + Math.max(0, e - s);
  }, 0);
  return {
    range,
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(nowMs).toISOString(),
    source: range === "24h" ? "checks" : "rollups",
    uptime: up + down > 0 ? round3((up / (up + down)) * 100) : null,
    totalChecks: up + down,
    upChecks: up,
    downChecks: down,
    expectedChecks: expected,
    coverage: expected > 0 ? Math.min(1, round3((up + down) / expected)) : null,
    latency: {
      avg: up > 0 ? Math.round(weighted / up) : null,
      min: series.reduce<number | null>((a, p) => (p.minResponseTimeMs === null ? a : a === null ? p.minResponseTimeMs : Math.min(a, p.minResponseTimeMs)), null),
      max: series.reduce<number | null>((a, p) => (p.maxResponseTimeMs === null ? a : a === null ? p.maxResponseTimeMs : Math.max(a, p.maxResponseTimeMs)), null),
      p50: range === "24h" ? percentile(lat, 50) : null,
      p95: range === "24h" ? percentile(lat, 95) : null,
    },
    incidents: { count: inWindow.length, downtimeSeconds: Math.round(downtime / 1000) },
    bucketSeconds: bucketSec,
    series,
    daily: [],
  };
}

function dailyFor(ctx: Ctx) {
  const today = new Date(ctx.nowMs);
  today.setUTCHours(0, 0, 0, 0);
  const r = rng(hashSeed(`${ctx.spec.id}:daily`));
  return Array.from({ length: 30 }, (_, i) => {
    const start = today.getTime() - (29 - i) * DAY * 60_000;
    const p = bucket(ctx, start, Math.min(start + DAY * 60_000, ctx.nowMs), r);
    return { date: new Date(start).toISOString().slice(0, 10), uptime: p.uptime, checks: p.upChecks + p.downChecks };
  });
}

function recentChecks(ctx: Ctx, incidents: IncidentDto[]): CheckDto[] {
  const { spec, nowMs } = ctx;
  if (spec.health === "paused") {
    // last checks before the pause
    return checksEndingAt(ctx, nowMs - (spec.pausedAgoMin ?? 0) * 60_000, incidents);
  }
  return checksEndingAt(ctx, nowMs, incidents);
}

function checksEndingAt(ctx: Ctx, endMs: number, incidents: IncidentDto[]): CheckDto[] {
  const { spec } = ctx;
  const r = rng(hashSeed(`${spec.id}:checks`));
  const step = spec.intervalSeconds * 1000;
  const last = Math.floor(endMs / step) * step;
  const out: CheckDto[] = [];
  for (let i = 0; i < 40; i++) {
    const t = last - i * step;
    const outage = incidents.find((inc) => t >= new Date(inc.startedAt).getTime() && (inc.resolvedAt === null || t < new Date(inc.resolvedAt).getTime()));
    const failed = !!outage;
    out.push({
      id: `${spec.id}-c${i}`,
      checkedAt: new Date(t).toISOString(),
      result: failed ? "DOWN" : "UP",
      responseTimeMs: failed && outage?.errorType !== "STATUS" ? null : latencyAt(ctx, t, r),
      statusCode: failed ? outage?.statusCode ?? null : spec.method === "HEAD" ? 200 : 200,
      errorType: failed ? outage?.errorType ?? "ERROR" : null,
      errorMessage: failed ? outage?.cause ?? null : null,
    });
  }
  return out;
}

/** Build the whole demo dataset for a given moment (rounded to 5 minutes for stability). */
export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  const nowMs = Math.floor(now.getTime() / 300_000) * 300_000;
  const monitors: DemoMonitor[] = [];
  const incidents: IncidentDto[] = [];
  const stats: DemoDataset["stats"] = {};
  const checks: DemoDataset["checks"] = {};

  for (const spec of SPECS) {
    const ctx: Ctx = { nowMs, spec };
    const mine: IncidentDto[] = outageWindows(ctx).map((w, idx) => ({
      id: `${spec.id}-inc${idx + 1}`,
      monitorId: spec.id,
      monitor: { id: spec.id, name: spec.name, url: spec.url },
      startedAt: new Date(w.start).toISOString(),
      resolvedAt: w.o.durationMin === null ? null : new Date(w.end).toISOString(),
      durationSeconds: w.o.durationMin === null ? null : w.o.durationMin * 60,
      cause: w.o.cause,
      errorType: w.o.errorType,
      statusCode: w.o.statusCode,
    }));
    incidents.push(...mine);

    const s24 = statsFor(ctx, "24h", mine);
    const daily = dailyFor(ctx);
    stats[spec.id] = {
      "24h": { ...s24, daily },
      "7d": { ...statsFor(ctx, "7d", mine), daily },
      "30d": { ...statsFor(ctx, "30d", mine), daily },
    };
    checks[spec.id] = recentChecks(ctx, mine);

    const latest = checks[spec.id]![0]!;
    const sparkline = Array.from({ length: 24 }, (_, i) => {
      const start = Math.floor(nowMs / 3_600_000) * 3_600_000 - (23 - i) * 3_600_000;
      return bucket(ctx, start, Math.min(start + 3_600_000, nowMs), rng(hashSeed(`${spec.id}:spark:${i}`))).avgResponseTimeMs;
    });
    const paused = spec.health === "paused";
    const down = spec.health === "down";
    const createdAt = new Date(nowMs - spec.createdDaysAgo * DAY * 60_000).toISOString();
    monitors.push({
      id: spec.id,
      name: spec.name,
      url: spec.url,
      method: spec.method,
      intervalSeconds: spec.intervalSeconds,
      timeoutMs: 10_000,
      expectedStatusCodes: "200-299",
      keyword: spec.id === "demo-storefront" ? "Add to cart" : null,
      followRedirects: true,
      failureThreshold: 2,
      recoveryThreshold: 2,
      retryIntervalSeconds: 20,
      notificationsEnabled: true,
      status: paused ? "PAUSED" : down ? "DOWN" : "UP",
      isStale: false,
      lastCheckedAt: latest.checkedAt,
      lastResponseTimeMs: latest.responseTimeMs,
      lastStatusCode: latest.statusCode,
      lastError: latest.errorMessage,
      lastStatusChangeAt: down ? mine.find((i) => i.resolvedAt === null)?.startedAt ?? null : createdAt,
      nextCheckAt: new Date(nowMs + spec.intervalSeconds * 1000).toISOString(),
      pausedAt: paused ? new Date(nowMs - (spec.pausedAgoMin ?? 0) * 60_000).toISOString() : null,
      createdAt,
      updatedAt: new Date(nowMs).toISOString(),
      stats24h: { uptime: s24.uptime, avgResponseTimeMs: s24.latency.avg, checks: s24.totalChecks },
      sparkline,
      health: spec.health,
      description: spec.description,
    });
  }

  incidents.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = monitors.filter((m) => m.stats24h.uptime !== null);
  const rtNum = monitors.reduce((a, m) => a + (m.stats24h.avgResponseTimeMs ?? 0) * m.stats24h.checks, 0);
  const rtDen = monitors.reduce((a, m) => a + (m.stats24h.avgResponseTimeMs === null ? 0 : m.stats24h.checks), 0);
  const hourStart = Math.floor(nowMs / 3_600_000) * 3_600_000 - 23 * 3_600_000;
  const summary: DashboardSummaryDto = {
    totals: {
      monitors: monitors.length,
      up: monitors.filter((m) => m.status === "UP").length,
      down: monitors.filter((m) => m.status === "DOWN").length,
      paused: monitors.filter((m) => m.status === "PAUSED").length,
      pending: 0,
      unknown: 0,
    },
    averageUptime24h: active.length ? round3(active.reduce((a, m) => a + (m.stats24h.uptime ?? 0), 0) / active.length) : null,
    averageResponseTimeMs24h: rtDen ? Math.round(rtNum / rtDen) : null,
    openIncidents: incidents.filter((i) => i.resolvedAt === null).length,
    incidentsLast24h: incidents.filter((i) => nowMs - new Date(i.startedAt).getTime() < DAY * 60_000).length,
    recentIncidents: incidents.slice(0, 6),
    responseTimeSeries: Array.from({ length: 24 }, (_, i) => {
      const t = hourStart + i * 3_600_000;
      const vals = monitors.map((m) => m.sparkline[i]).filter((v): v is number => v !== null && v !== undefined);
      return { t: new Date(t).toISOString(), avgResponseTimeMs: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
    }),
    checksLast24h: monitors.reduce((a, m) => a + m.stats24h.checks, 0),
  };

  return { generatedAt: new Date(nowMs).toISOString(), monitors, incidents, summary, stats, checks };
}

export function findDemoMonitor(data: DemoDataset, id: string): DemoMonitor | undefined {
  return data.monitors.find((m) => m.id === id);
}
