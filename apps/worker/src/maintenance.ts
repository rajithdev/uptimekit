import type { PrismaClient } from "@uptimekit/database";
import type { Queue } from "bullmq";
import { enqueueNotifications, type RetryPolicy } from "./notifications/enqueue";
import type { NotificationJobData } from "./queues";

/**
 * Mark active monitors whose data is stale as UNKNOWN: no completed check for 3 intervals
 * (minimum 5 minutes). DOWN monitors are left DOWN — their incident remains open until a
 * confirmed recovery — and the UI flags their data as stale.
 */
export async function markStaleMonitorsUnknown(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  return prisma.$executeRaw`
    UPDATE monitors
    SET status = 'UNKNOWN', last_status_change_at = ${now}, consecutive_successes = 0, consecutive_failures = 0
    WHERE status IN ('UP', 'PENDING')
      AND COALESCE(last_checked_at, created_at)
          < ${now}::timestamptz - make_interval(secs => GREATEST(interval_seconds * 3, 300))`;
}

/** Delete raw checks older than the retention period, in bounded batches. Hourly rollups are kept. */
export async function pruneOldChecks(prisma: PrismaClient, retentionDays: number, now: Date = new Date(), batchSize = 5000): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 3600 * 1000);
  let total = 0;
  for (;;) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM checks WHERE id IN (
        SELECT id FROM checks WHERE checked_at < ${cutoff} LIMIT ${batchSize}
      )`;
    total += deleted;
    if (deleted < batchSize) return total;
  }
}

/**
 * Outbox sweeper: re-enqueue notifications that are still PENDING well after creation
 * (e.g. the worker crashed between committing the incident and enqueueing the job).
 */
export async function requeueStuckNotifications(
  prisma: PrismaClient,
  queue: Queue<NotificationJobData>,
  retry: RetryPolicy,
  olderThanMs = 2 * 60_000,
  now: Date = new Date(),
): Promise<number> {
  const stuck = await prisma.notification.findMany({
    where: { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - olderThanMs) } },
    select: { id: true },
    take: 500,
  });
  const ids: string[] = [];
  for (const { id } of stuck) {
    const job = await queue.getJob(id);
    // Only re-add when no job exists; an existing waiting/delayed/active job will deliver it.
    if (!job) ids.push(id);
    else if (await job.isFailed()) {
      // Retries exhausted without the FAILED status being persisted (crash) — record it.
      await prisma.notification.update({ where: { id }, data: { status: "FAILED", lastError: job.failedReason?.slice(0, 500) ?? "delivery failed" } });
    }
  }
  await enqueueNotifications(queue, ids, retry);
  return ids.length;
}
