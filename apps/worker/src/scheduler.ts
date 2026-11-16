import type { PrismaClient } from "@uptimekit/database";
import type { Logger } from "./logger";
import type { Queues } from "./queues";

export interface ClaimedCheck {
  id: string;
  scheduledFor: Date;
  intervalSeconds: number;
}

/**
 * Atomically claim monitors whose `next_check_at` has passed and push their next check one
 * interval into the future.
 *
 * `FOR UPDATE SKIP LOCKED` makes concurrent schedulers (several worker replicas) claim
 * disjoint sets of monitors, and because `next_check_at` moves forward in the same statement a
 * monitor is claimed at most once per interval. If workers fall behind, due monitors simply
 * wait in the database — jobs never pile up in Redis.
 */
export async function claimDueMonitors(prisma: PrismaClient, limit: number, now: Date = new Date()): Promise<ClaimedCheck[]> {
  const rows = await prisma.$queryRaw<{ id: string; scheduled_for: Date; interval_seconds: number }[]>`
    WITH due AS (
      SELECT id, next_check_at, interval_seconds
      FROM monitors
      WHERE status <> 'PAUSED' AND next_check_at <= ${now}
      ORDER BY next_check_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE monitors m
    SET next_check_at = ${now}::timestamptz + make_interval(secs => m.interval_seconds)
    FROM due
    WHERE m.id = due.id
    RETURNING m.id, due.next_check_at AS scheduled_for, due.interval_seconds`;
  return rows.map((r) => ({ id: r.id, scheduledFor: r.scheduled_for, intervalSeconds: r.interval_seconds }));
}

export function checkJobId(monitorId: string, scheduledFor: Date): string {
  return `${monitorId}-${scheduledFor.getTime()}`;
}

export interface SchedulerOptions {
  prisma: PrismaClient;
  queues: Queues;
  logger: Logger;
  batchSize: number;
  maxQueued: number;
}

/** One scheduler tick. Returns the number of checks enqueued. */
export async function runSchedulerTick(opts: SchedulerOptions): Promise<number> {
  const counts = await opts.queues.checks.getJobCounts("waiting", "prioritized", "delayed");
  const backlog = (counts.waiting ?? 0) + (counts.prioritized ?? 0) + (counts.delayed ?? 0);
  if (backlog >= opts.maxQueued) {
    // Backpressure: leave monitors due in the DB rather than flooding Redis.
    opts.logger.warn({ backlog }, "check queue backlog high; skipping claim this tick");
    return 0;
  }
  const claimed = await claimDueMonitors(opts.prisma, Math.min(opts.batchSize, opts.maxQueued - backlog));
  if (claimed.length === 0) return 0;
  const now = Date.now();
  await opts.queues.checks.addBulk(
    claimed.map((c) => ({
      name: "check",
      data: {
        monitorId: c.id,
        scheduledFor: c.scheduledFor.toISOString(),
        enqueuedAt: now,
        intervalSeconds: c.intervalSeconds,
      },
      // Deterministic id: enqueueing the same slot twice is a no-op in BullMQ.
      opts: { jobId: checkJobId(c.id, c.scheduledFor) },
    })),
  );
  opts.logger.debug({ count: claimed.length }, "enqueued checks");
  return claimed.length;
}
