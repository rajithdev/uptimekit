import "server-only";
import { Prisma, type Monitor } from "@uptimekit/database";
import {
  buildMonitorCreateSchema,
  buildMonitorUpdateSchema,
  crossFieldIssues,
  uptimePercentage,
  type MonitorListQuery,
} from "@uptimekit/shared";
import { ApiError } from "../../api/errors";
import type { MonitorDto, MonitorListItemDto, Paginated } from "../../api/types";
import { db } from "../db";
import { env } from "../env";
import { paginate, toMonitorDto } from "./serializers";

export function monitorSchemas() {
  const e = env();
  const options = { ipPolicy: { allowCidrs: e.allowCidrs }, minIntervalSeconds: e.MONITOR_MIN_INTERVAL_SECONDS };
  return { create: buildMonitorCreateSchema(options), update: buildMonitorUpdateSchema(options) };
}

/** Load a monitor owned by the user or throw 404 (never 403, to avoid leaking existence). */
export async function getOwnedMonitor(userId: string, monitorId: string): Promise<Monitor> {
  const monitor = await db().monitor.findFirst({ where: { id: monitorId, userId } });
  if (!monitor) throw ApiError.notFound("Monitor");
  return monitor;
}

export async function listMonitors(userId: string, q: MonitorListQuery): Promise<Paginated<MonitorListItemDto>> {
  const where: Prisma.MonitorWhereInput = {
    userId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { url: { contains: q.q, mode: "insensitive" } }] }
      : {}),
  };
  const orderBy: Prisma.MonitorOrderByWithRelationInput[] = [
    { [q.sort]: q.sort === "lastCheckedAt" || q.sort === "lastResponseTimeMs" ? { sort: q.order, nulls: "last" } : q.order },
    { id: "asc" },
  ];
  const [total, monitors] = await Promise.all([
    db().monitor.count({ where }),
    db().monitor.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  const extras = await monitorExtras24h(monitors.map((m) => m.id));
  return {
    data: monitors.map((m) => ({
      ...toMonitorDto(m),
      ...(extras.get(m.id) ?? { stats24h: { uptime: null, avgResponseTimeMs: null, checks: 0 }, sparkline: emptySparkline() }),
    })),
    pagination: paginate(q.page, q.pageSize, total),
  };
}

function emptySparkline(): (number | null)[] {
  return Array.from({ length: 24 }, () => null);
}

/** 24h uptime/latency (exact, from raw checks) and an hourly latency sparkline (from rollups). */
async function monitorExtras24h(ids: string[]) {
  const out = new Map<string, Pick<MonitorListItemDto, "stats24h" | "sparkline">>();
  if (ids.length === 0) return out;
  const since = new Date(Date.now() - 24 * 3600_000);
  const hourStart = new Date(Math.floor(Date.now() / 3600_000) * 3600_000 - 23 * 3600_000);

  const [agg, rollups] = await Promise.all([
    db().$queryRaw<{ monitor_id: string; up: bigint; down: bigint; avg_rt: number | null }[]>`
      SELECT monitor_id,
             COUNT(*) FILTER (WHERE result = 'UP') AS up,
             COUNT(*) FILTER (WHERE result = 'DOWN') AS down,
             AVG(response_time_ms)::float8 AS avg_rt
      FROM checks
      WHERE monitor_id = ANY(${ids}) AND checked_at >= ${since}
      GROUP BY monitor_id`,
    db().checkRollupHourly.findMany({
      where: { monitorId: { in: ids }, hour: { gte: hourStart } },
      select: { monitorId: true, hour: true, responseTimeSumMs: true, responseTimeCount: true },
    }),
  ]);

  for (const id of ids) out.set(id, { stats24h: { uptime: null, avgResponseTimeMs: null, checks: 0 }, sparkline: emptySparkline() });
  for (const row of agg) {
    const up = Number(row.up);
    const down = Number(row.down);
    out.get(row.monitor_id)!.stats24h = {
      uptime: uptimePercentage(up, down),
      avgResponseTimeMs: row.avg_rt === null ? null : Math.round(row.avg_rt),
      checks: up + down,
    };
  }
  for (const r of rollups) {
    const idx = Math.round((r.hour.getTime() - hourStart.getTime()) / 3600_000);
    const entry = out.get(r.monitorId);
    if (entry && idx >= 0 && idx < 24 && r.responseTimeCount > 0) {
      entry.sparkline[idx] = Math.round(Number(r.responseTimeSumMs) / r.responseTimeCount);
    }
  }
  return out;
}

export async function createMonitor(userId: string, input: unknown): Promise<MonitorDto> {
  const data = monitorSchemas().create.parse(input);
  const count = await db().monitor.count({ where: { userId } });
  if (count >= env().MAX_MONITORS_PER_USER) {
    throw new ApiError(403, "LIMIT_EXCEEDED", `You can have at most ${env().MAX_MONITORS_PER_USER} monitors`);
  }
  const monitor = await db().monitor.create({
    data: { ...data, userId, status: "PENDING", nextCheckAt: new Date() },
  });
  return toMonitorDto(monitor);
}

export async function updateMonitor(userId: string, monitorId: string, input: unknown): Promise<MonitorDto> {
  const patch = monitorSchemas().update.parse(input);
  const existing = await getOwnedMonitor(userId, monitorId);

  // Cross-field rules are evaluated on the merged result, not just the patch.
  const merged = { ...existing, ...patch };
  const issues = crossFieldIssues(merged);
  if (issues.length > 0) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", issues);

  const targetChanged =
    (patch.url !== undefined && patch.url !== existing.url) ||
    (patch.method !== undefined && patch.method !== existing.method) ||
    (patch.expectedStatusCodes !== undefined && patch.expectedStatusCodes !== existing.expectedStatusCodes) ||
    (patch.keyword !== undefined && patch.keyword !== existing.keyword);
  const scheduleChanged = patch.intervalSeconds !== undefined && patch.intervalSeconds !== existing.intervalSeconds;
  const active = existing.status !== "PAUSED";

  const updated = await db().monitor.update({
    where: { id: existing.id },
    data: {
      ...patch,
      // A new target means previous confirmation streaks no longer apply. Open incidents
      // stay open and are resolved by the next confirmed UP result.
      ...(targetChanged && active ? { status: "PENDING", consecutiveFailures: 0, consecutiveSuccesses: 0 } : {}),
      ...((targetChanged || scheduleChanged) && active ? { nextCheckAt: new Date() } : {}),
    },
  });
  return toMonitorDto(updated);
}

export async function deleteMonitor(userId: string, monitorId: string): Promise<void> {
  const { count } = await db().monitor.deleteMany({ where: { id: monitorId, userId } });
  if (count === 0) throw ApiError.notFound("Monitor");
}

/**
 * Pause monitoring. Paused time produces no checks and is excluded from uptime. Any open
 * incident is closed at the pause time (no recovery alert is sent, because recovery was not
 * observed).
 */
export async function pauseMonitor(userId: string, monitorId: string): Promise<MonitorDto> {
  return db().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM monitors WHERE id = ${monitorId} AND user_id = ${userId} FOR UPDATE`;
    if (!rows[0]) throw ApiError.notFound("Monitor");
    const now = new Date();
    if (rows[0].status !== "PAUSED") {
      const open = await tx.incident.findFirst({ where: { monitorId, resolvedAt: null } });
      if (open) {
        await tx.incident.update({
          where: { id: open.id },
          data: { resolvedAt: now, durationSeconds: Math.max(0, Math.round((now.getTime() - open.startedAt.getTime()) / 1000)) },
        });
      }
      await tx.monitor.update({
        where: { id: monitorId },
        data: { status: "PAUSED", pausedAt: now, consecutiveFailures: 0, consecutiveSuccesses: 0, lastStatusChangeAt: now },
      });
    }
    return toMonitorDto(await tx.monitor.findUniqueOrThrow({ where: { id: monitorId } }));
  });
}

export async function resumeMonitor(userId: string, monitorId: string): Promise<MonitorDto> {
  const existing = await getOwnedMonitor(userId, monitorId);
  if (existing.status !== "PAUSED") return toMonitorDto(existing);
  const now = new Date();
  const updated = await db().monitor.update({
    where: { id: existing.id },
    data: { status: "PENDING", pausedAt: null, consecutiveFailures: 0, consecutiveSuccesses: 0, nextCheckAt: now, lastStatusChangeAt: now },
  });
  return toMonitorDto(updated);
}
