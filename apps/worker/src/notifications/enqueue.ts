import type { Queue } from "bullmq";
import type { NotificationJobData } from "../queues";

export interface RetryPolicy {
  attempts: number;
  /** Base delay for exponential backoff (ms): delay, 2×delay, 4×delay, … */
  backoffMs: number;
}

export async function enqueueNotifications(
  queue: Queue<NotificationJobData>,
  notificationIds: string[],
  retry: RetryPolicy,
): Promise<void> {
  if (notificationIds.length === 0) return;
  await queue.addBulk(
    notificationIds.map((notificationId) => ({
      name: "deliver",
      data: { notificationId },
      opts: {
        // Job id = notification id: re-enqueueing (e.g. by the outbox sweeper) is a no-op
        // while the job still exists, so a notification is never delivered by two jobs.
        jobId: notificationId,
        attempts: retry.attempts,
        backoff: { type: "exponential", delay: retry.backoffMs },
      },
    })),
  );
}
