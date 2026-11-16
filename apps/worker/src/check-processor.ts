import type { PrismaClient } from "@uptimekit/database";
import { performHttpCheck, type HttpCheckOptions } from "@uptimekit/shared/server";
import { applyCheckResult, type ApplyOutcome } from "./apply-result";
import type { Logger } from "./logger";
import type { CheckJobData, Queues } from "./queues";
import { enqueueNotifications, type RetryPolicy } from "./notifications/enqueue";

export interface CheckProcessorDeps {
  prisma: PrismaClient;
  queues: Pick<Queues, "notifications">;
  logger: Logger;
  checkOptions: HttpCheckOptions;
  notificationRetry: RetryPolicy;
  now?: () => number;
}

export type ProcessOutcome = ApplyOutcome | { applied: false; reason: "stale_job" | "monitor_missing" };

/** Execute one scheduled check: run the HTTP request, then persist and evaluate the result. */
export async function processCheckJob(deps: CheckProcessorDeps, data: CheckJobData): Promise<ProcessOutcome> {
  const now = deps.now ?? Date.now;

  // If this job sat in the queue for longer than an interval, a newer slot has been (or will
  // be) scheduled. Running it now would only produce a burst of out-of-date checks.
  const maxAgeMs = Math.max(data.intervalSeconds * 1000, 30_000);
  if (now() - data.enqueuedAt > maxAgeMs) {
    deps.logger.warn({ monitorId: data.monitorId }, "dropping stale check job");
    return { applied: false, reason: "stale_job" };
  }

  const monitor = await deps.prisma.monitor.findUnique({
    where: { id: data.monitorId },
    select: {
      id: true,
      url: true,
      method: true,
      timeoutMs: true,
      expectedStatusCodes: true,
      keyword: true,
      followRedirects: true,
      status: true,
    },
  });
  if (!monitor) return { applied: false, reason: "monitor_missing" };
  if (monitor.status === "PAUSED") return { applied: false, reason: "monitor_paused" };

  const startedAt = new Date(now());
  const result = await performHttpCheck(
    {
      url: monitor.url,
      method: monitor.method,
      timeoutMs: monitor.timeoutMs,
      expectedStatusCodes: monitor.expectedStatusCodes,
      keyword: monitor.keyword,
      followRedirects: monitor.followRedirects,
    },
    deps.checkOptions,
  );

  const outcome = await applyCheckResult(deps.prisma, monitor.id, result, startedAt);

  if (outcome.applied && outcome.incident) {
    deps.logger.info(
      { monitorId: monitor.id, incidentId: outcome.incident.id, action: outcome.incident.action, status: outcome.status },
      outcome.incident.action === "OPENED" ? "incident opened" : "incident resolved",
    );
  }
  if (outcome.applied && outcome.pendingNotificationIds.length > 0) {
    // After commit. If we crash right here the outbox sweeper re-enqueues the PENDING rows.
    await enqueueNotifications(deps.queues.notifications, outcome.pendingNotificationIds, deps.notificationRetry);
  }
  return outcome;
}
