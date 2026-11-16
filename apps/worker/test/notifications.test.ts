import type { PrismaClient } from "@uptimekit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { markStaleMonitorsUnknown, pruneOldChecks, requeueStuckNotifications } from "../src/maintenance";
import { enqueueNotifications } from "../src/notifications/enqueue";
import type { EmailMessage, EmailProvider } from "../src/notifications/provider";
import { escapeHtml, formatDuration, renderAlertEmail } from "../src/notifications/templates";
import { createWorkerRuntime, type WorkerRuntime } from "../src/runtime";
import { TEST_DATABASE_URL, TEST_REDIS_URL } from "./env";
import { createMonitor, createTestPrisma, createUser, resetDatabase, testLogger, waitFor } from "./helpers";

/**
 * Delivery retry behaviour. The provider here is a controllable stub so we can force
 * transient and permanent failures; real SMTP delivery is covered in worker-runtime.test.ts.
 */
class ScriptedProvider implements EmailProvider {
  readonly name = "scripted";
  sent: EmailMessage[] = [];
  failuresRemaining = 0;
  async send(message: EmailMessage) {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("SMTP 451 temporary failure");
    }
    this.sent.push(message);
    return { messageId: `id-${this.sent.length}` };
  }
}

let prisma: PrismaClient;
let runtime: WorkerRuntime;
const provider = new ScriptedProvider();
const retry = { attempts: 3, backoffMs: 50 };

beforeAll(async () => {
  prisma = createTestPrisma();
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    WORKER_HEALTH_PORT: "0",
    NOTIFICATION_MAX_ATTEMPTS: "3",
    NOTIFICATION_BACKOFF_MS: "50",
  });
  runtime = createWorkerRuntime(config, testLogger, { prisma, emailProvider: provider, disableTimers: true });
  await runtime.start();
});
afterAll(async () => {
  await runtime.stop();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(prisma);
  provider.sent = [];
  provider.failuresRemaining = 0;
});

async function pendingNotification() {
  const user = await createUser(prisma, "retry@example.com");
  const m = await createMonitor(prisma, user.id, { name: "Billing <script>", url: "https://example.com" });
  const incident = await prisma.incident.create({
    data: { monitorId: m.id, userId: user.id, startedAt: new Date(), cause: "Connection failed (ECONNREFUSED)" },
  });
  return prisma.notification.create({
    data: { userId: user.id, monitorId: m.id, incidentId: incident.id, type: "INCIDENT_OPENED", recipient: "retry@example.com" },
  });
}

describe("notification delivery", () => {
  it("retries transient failures with backoff and records attempts", async () => {
    const n = await pendingNotification();
    provider.failuresRemaining = 2;
    await enqueueNotifications(runtime.queues.notifications, [n.id], retry);
    const done = await waitFor(async () => {
      const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
      return row.status === "SENT" ? row : null;
    });
    expect(done.attempts).toBe(3);
    expect(done.lastError).toBeNull();
    expect(provider.sent).toHaveLength(1);
  });

  it("marks FAILED with the last error after exhausting retries", async () => {
    const n = await pendingNotification();
    provider.failuresRemaining = 10;
    await enqueueNotifications(runtime.queues.notifications, [n.id], retry);
    const failed = await waitFor(async () => {
      const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
      return row.status === "FAILED" ? row : null;
    });
    expect(failed.attempts).toBe(3);
    expect(failed.lastError).toMatch(/451/);
    expect(provider.sent).toHaveLength(0);
  });

  it("never sends the same notification twice when enqueued repeatedly", async () => {
    const n = await pendingNotification();
    await Promise.all([
      enqueueNotifications(runtime.queues.notifications, [n.id], retry),
      enqueueNotifications(runtime.queues.notifications, [n.id], retry),
      enqueueNotifications(runtime.queues.notifications, [n.id], retry),
    ]);
    await waitFor(async () => (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status === "SENT");
    await new Promise((r) => setTimeout(r, 300));
    expect(provider.sent).toHaveLength(1);
  });

  it("the outbox sweeper re-enqueues notifications that were never queued", async () => {
    const n = await pendingNotification();
    // Simulate a crash between commit and enqueue: the row exists but no job does.
    const old = new Date(Date.now() - 10 * 60_000);
    await prisma.$executeRaw`UPDATE notifications SET updated_at = ${old} WHERE id = ${n.id}`;
    const requeued = await requeueStuckNotifications(prisma, runtime.queues.notifications, retry);
    expect(requeued).toBe(1);
    await waitFor(async () => (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status === "SENT");
  });

  it("escapes user-controlled content in emails and strips header injection", () => {
    const msg = renderAlertEmail(
      {
        type: "INCIDENT_OPENED",
        monitorName: "Evil\r\nBcc: victim@example.com <img src=x>",
        monitorUrl: "https://example.com/?q=<script>",
        monitorId: "m1",
        incidentId: "i1",
        cause: "Unexpected HTTP status 500",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        resolvedAt: null,
        durationSeconds: null,
        appUrl: "http://localhost:3000",
      },
      "to@example.com",
    );
    expect(msg.subject).not.toMatch(/[\r\n]/);
    expect(msg.html).not.toContain("<img src=x>");
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;img src=x&gt;");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
    expect(formatDuration(3725)).toBe("1h 2m 5s");
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("maintenance", () => {
  it("marks stale active monitors UNKNOWN but leaves DOWN and PAUSED alone", async () => {
    const user = await createUser(prisma);
    const long = new Date(Date.now() - 60 * 60_000);
    const stale = await createMonitor(prisma, user.id, { url: "https://a.example.com", status: "UP", lastCheckedAt: long });
    const fresh = await createMonitor(prisma, user.id, { url: "https://b.example.com", status: "UP", lastCheckedAt: new Date() });
    const downStale = await createMonitor(prisma, user.id, { url: "https://c.example.com", status: "DOWN", lastCheckedAt: long });
    const paused = await createMonitor(prisma, user.id, { url: "https://d.example.com", status: "PAUSED", lastCheckedAt: long });
    expect(await markStaleMonitorsUnknown(prisma)).toBe(1);
    const statuses = await prisma.monitor.findMany({ select: { id: true, status: true } });
    const by = Object.fromEntries(statuses.map((s) => [s.id, s.status]));
    expect(by[stale.id]).toBe("UNKNOWN");
    expect(by[fresh.id]).toBe("UP");
    expect(by[downStale.id]).toBe("DOWN");
    expect(by[paused.id]).toBe("PAUSED");
  });

  it("prunes raw checks beyond retention but keeps rollups", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com" });
    const old = new Date(Date.now() - 40 * 24 * 3600_000);
    await prisma.check.createMany({
      data: [
        ...Array.from({ length: 7 }, () => ({ monitorId: m.id, checkedAt: old, result: "UP" as const })),
        { monitorId: m.id, checkedAt: new Date(), result: "UP" as const },
      ],
    });
    await prisma.checkRollupHourly.create({ data: { monitorId: m.id, hour: old, totalChecks: 7, upChecks: 7 } });
    expect(await pruneOldChecks(prisma, 30, new Date(), 3)).toBe(7);
    expect(await prisma.check.count()).toBe(1);
    expect(await prisma.checkRollupHourly.count()).toBe(1);
  });
});
