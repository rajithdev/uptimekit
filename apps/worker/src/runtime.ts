import { checkSchema, createPrismaClient, type PrismaClient } from "@uptimekit/database";
import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type http from "node:http";
import { processCheckJob } from "./check-processor";
import type { WorkerConfig } from "./config";
import { startHealthServer, type HealthState } from "./health";
import type { Logger } from "./logger";
import { markStaleMonitorsUnknown, pruneOldChecks, requeueStuckNotifications } from "./maintenance";
import { deliverNotification } from "./notifications/deliver";
import { ConsoleEmailProvider, ResendEmailProvider, SmtpEmailProvider, type EmailProvider } from "./notifications/provider";
import { CHECK_QUEUE, NOTIFICATION_QUEUE, createQueues, createRedis, type CheckJobData, type NotificationJobData, type Queues } from "./queues";
import { runSchedulerTick } from "./scheduler";

export interface RuntimeOverrides {
  prisma?: PrismaClient;
  emailProvider?: EmailProvider;
  /** Disable the periodic loops (tests drive them manually). */
  disableTimers?: boolean;
}

export interface WorkerRuntime {
  prisma: PrismaClient;
  queues: Queues;
  start(): Promise<void>;
  stop(): Promise<void>;
  tick(): Promise<number>;
}

export function createEmailProvider(config: WorkerConfig, logger: Logger): EmailProvider {
  if (config.EMAIL_PROVIDER === "smtp") {
    return new SmtpEmailProvider(config.EMAIL_FROM, {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      password: config.SMTP_PASSWORD,
    });
  }
  if (config.EMAIL_PROVIDER === "resend") {
    return new ResendEmailProvider(config.EMAIL_FROM, config.RESEND_API_KEY ?? "", config.RESEND_API_URL);
  }
  return new ConsoleEmailProvider(logger);
}

export function createWorkerRuntime(config: WorkerConfig, logger: Logger, overrides: RuntimeOverrides = {}): WorkerRuntime {
  const prisma = overrides.prisma ?? createPrismaClient({ connectionString: config.DATABASE_URL, maxConnections: Math.min(50, config.WORKER_CONCURRENCY + 5) });
  const queueConnection: Redis = createRedis(config.REDIS_URL);
  const queues = createQueues(queueConnection);
  const emailProvider = overrides.emailProvider ?? createEmailProvider(config, logger);
  const checkOptions = { policy: { allowCidrs: config.allowCidrs } };
  const notificationRetry = { attempts: config.NOTIFICATION_MAX_ATTEMPTS, backoffMs: config.NOTIFICATION_BACKOFF_MS };

  let checkWorker: Worker<CheckJobData> | null = null;
  let notificationWorker: Worker<NotificationJobData> | null = null;
  let workerConnections: Redis[] = [];
  const timers: NodeJS.Timeout[] = [];
  let healthServer: http.Server | null = null;
  let tickRunning = false;
  let stopping = false;

  const health: HealthState = {
    ready: false,
    lastSchedulerTickAt: null,
    checks: async () => {
      const [db, redis] = await Promise.all([
        prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        queueConnection.ping().then((r) => r === "PONG").catch(() => false),
      ]);
      return { database: db, redis };
    },
  };

  const tick = async (): Promise<number> => {
    if (tickRunning || stopping) return 0;
    tickRunning = true;
    try {
      const n = await runSchedulerTick({ prisma, queues, logger, batchSize: config.SCHEDULER_BATCH_SIZE, maxQueued: config.MAX_QUEUED_CHECKS });
      health.lastSchedulerTickAt = Date.now();
      return n;
    } catch (err) {
      logger.error({ err }, "scheduler tick failed");
      return 0;
    } finally {
      tickRunning = false;
    }
  };

  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    const t = setInterval(() => {
      if (stopping) return;
      fn().catch((err) => logger.error({ err, task: name }, "maintenance task failed"));
    }, ms);
    t.unref();
    timers.push(t);
  };

  return {
    prisma,
    queues,
    tick,
    async start() {
      if (config.allowCidrs.length > 0) {
        logger.warn({ allowCidrs: config.allowCidrs }, "CHECKER_ALLOW_CIDRS is set: SSRF protection is relaxed for these ranges. Never use this in production.");
        if (config.NODE_ENV === "production" && process.env.UPTIMEKIT_E2E !== "1") {
          throw new Error("CHECKER_ALLOW_CIDRS must not be set when NODE_ENV=production");
        }
      }

      // Deployment safety gate: never process jobs against a schema older than this release
      // expects. Until migrations land, health stays down and the previous release keeps running.
      const deadline = Date.now() + config.SCHEMA_WAIT_TIMEOUT_MS;
      for (;;) {
        const schema = await checkSchema(prisma);
        if (schema.ready) break;
        if (stopping) return;
        if (Date.now() >= deadline) {
          throw new Error(`Database schema not ready after ${config.SCHEMA_WAIT_TIMEOUT_MS}ms; missing migrations: ${schema.missing.join(", ")}`);
        }
        logger.warn({ missing: schema.missing }, "waiting for database migrations before starting");
        await new Promise((r) => setTimeout(r, 5_000));
      }

      const checkConn = createRedis(config.REDIS_URL);
      const notifConn = createRedis(config.REDIS_URL);
      workerConnections = [checkConn, notifConn];

      checkWorker = new Worker<CheckJobData>(
        CHECK_QUEUE,
        async (job) => {
          const outcome = await processCheckJob(
            { prisma, queues, logger, checkOptions, notificationRetry },
            job.data,
          );
          return outcome.applied ? { status: outcome.status, transition: outcome.transition } : { skipped: outcome.reason };
        },
        {
          connection: checkConn,
          concurrency: config.WORKER_CONCURRENCY,
          // Must exceed the longest possible check (60s timeout) so locks are not lost mid-check.
          lockDuration: 90_000,
          stalledInterval: 30_000,
        },
      );

      notificationWorker = new Worker<NotificationJobData>(
        NOTIFICATION_QUEUE,
        async (job) => {
          const maxAttempts = job.opts.attempts ?? 1;
          const isFinal = job.attemptsMade + 1 >= maxAttempts;
          return deliverNotification({ prisma, provider: emailProvider, logger, appUrl: config.APP_URL }, job.data.notificationId, isFinal);
        },
        {
          connection: notifConn,
          concurrency: 5,
        },
      );

      for (const w of [checkWorker, notificationWorker] as Worker[]) {
        w.on("error", (err) => logger.error({ err, queue: w.name }, "queue worker error"));
        w.on("failed", (job, err) => logger.debug({ queue: w.name, jobId: job?.id, err: err.message }, "job failed"));
      }
      await Promise.all([checkWorker.waitUntilReady(), notificationWorker.waitUntilReady()]);

      if (!overrides.disableTimers) {
        every(config.SCHEDULER_TICK_MS, "scheduler", tick);
        every(60_000, "stale-sweep", async () => {
          const n = await markStaleMonitorsUnknown(prisma);
          if (n > 0) logger.warn({ count: n }, "marked stale monitors UNKNOWN");
        });
        every(60_000, "outbox-sweep", async () => {
          const n = await requeueStuckNotifications(prisma, queues.notifications, notificationRetry);
          if (n > 0) logger.warn({ count: n }, "re-enqueued stuck notifications");
        });
        every(60 * 60_000, "retention", async () => {
          const n = await pruneOldChecks(prisma, config.CHECK_RETENTION_DAYS);
          if (n > 0) logger.info({ count: n }, "pruned old checks");
        });
        await tick();
      }

      if (config.WORKER_HEALTH_PORT > 0) healthServer = startHealthServer(config.WORKER_HEALTH_PORT, health);
      health.ready = true;
      if (overrides.disableTimers) health.lastSchedulerTickAt = Date.now();
      logger.info({ concurrency: config.WORKER_CONCURRENCY, email: emailProvider.name }, "worker started");
    },

    /**
     * Graceful shutdown: stop scheduling, let in-flight checks and deliveries finish, then
     * close connections. Anything not finished is recovered on restart: due monitors are still
     * due in the database, and stalled BullMQ jobs are re-delivered.
     */
    async stop() {
      if (stopping) return;
      stopping = true;
      health.ready = false;
      for (const t of timers) clearInterval(t);
      logger.info("worker shutting down; waiting for in-flight jobs");
      await Promise.all([checkWorker?.close(), notificationWorker?.close()]);
      await Promise.all([queues.checks.close(), queues.notifications.close()]);
      await Promise.all([queueConnection.quit(), ...workerConnections.map((c) => c.quit().catch(() => undefined))]);
      if (healthServer) await new Promise<void>((r) => healthServer!.close(() => r()));
      if (!overrides.prisma) await prisma.$disconnect();
      logger.info("worker stopped");
    },
  };
}
