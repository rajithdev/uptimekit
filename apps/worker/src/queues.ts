import { Queue } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

export const CHECK_QUEUE = "uptimekit-checks";
export const NOTIFICATION_QUEUE = "uptimekit-notifications";

export interface CheckJobData {
  monitorId: string;
  /** When the check was due (ISO). */
  scheduledFor: string;
  /** When the job was enqueued (epoch ms) — used to drop stale jobs when workers fall behind. */
  enqueuedAt: number;
  intervalSeconds: number;
}

export interface NotificationJobData {
  notificationId: string;
}

export function createRedis(url: string, extra: RedisOptions = {}): Redis {
  // BullMQ workers require maxRetriesPerRequest: null so blocking commands survive reconnects.
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, ...extra });
}

export function createQueues(connection: Redis) {
  const checks = new Queue<CheckJobData>(CHECK_QUEUE, {
    connection,
    defaultJobOptions: {
      // A check is never retried by the queue: the next scheduled check *is* the retry,
      // and the state machine handles confirmation.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
    },
  });
  const notifications = new Queue<NotificationJobData>(NOTIFICATION_QUEUE, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return { checks, notifications };
}

export type Queues = ReturnType<typeof createQueues>;
