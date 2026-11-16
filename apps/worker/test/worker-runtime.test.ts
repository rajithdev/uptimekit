import type { PrismaClient } from "@uptimekit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createWorkerRuntime, type WorkerRuntime } from "../src/runtime";
import { MAILPIT_API_URL, MAILPIT_SMTP_PORT, TEST_DATABASE_URL, TEST_REDIS_URL } from "./env";
import { createMonitor, createTestPrisma, createUser, resetDatabase, startTargetServer, testLogger, waitFor, type TargetServer } from "./helpers";

/**
 * Full-stack worker test: real BullMQ queues on Redis, real Postgres, real HTTP requests to a
 * local target server, and real SMTP delivery into Mailpit. Nothing in the monitoring path is
 * mocked.
 */

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function mailpitMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT_API_URL}/api/v1/messages?limit=200`);
  if (!res.ok) throw new Error(`Mailpit API ${res.status}`);
  return ((await res.json()) as { messages: MailpitMessage[] }).messages;
}

let prisma: PrismaClient;
let runtime: WorkerRuntime;
let target: TargetServer;

beforeAll(async () => {
  prisma = createTestPrisma();
  target = await startTargetServer();
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    APP_URL: "http://localhost:3000",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "localhost",
    SMTP_PORT: String(MAILPIT_SMTP_PORT),
    SMTP_SECURE: "false",
    WORKER_HEALTH_PORT: "0",
    CHECKER_ALLOW_CIDRS: "127.0.0.1/32",
    WORKER_CONCURRENCY: "5",
  });
  runtime = createWorkerRuntime(config, testLogger, { prisma, disableTimers: true });
  await runtime.start();
});

afterAll(async () => {
  await runtime.stop();
  await target.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await fetch(`${MAILPIT_API_URL}/api/v1/messages`, { method: "DELETE" });
});

/** Make the monitor due now, run one scheduler tick, and wait for the resulting check. */
async function runOneCheck(monitorId: string) {
  const before = await prisma.check.count({ where: { monitorId } });
  await prisma.monitor.update({ where: { id: monitorId }, data: { nextCheckAt: new Date(Date.now() - 1000) } });
  expect(await runtime.tick()).toBeGreaterThanOrEqual(1);
  await waitFor(async () => (await prisma.check.count({ where: { monitorId } })) > before);
  return prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });
}

describe("worker runtime (BullMQ + Postgres + real HTTP + Mailpit)", () => {
  it("detects an outage, alerts by email, detects recovery and sends a recovery email", async () => {
    const user = await createUser(prisma, "alerts-e2e@example.com");
    const m = await createMonitor(prisma, user.id, { name: "Checkout API", url: target.url, failureThreshold: 2, recoveryThreshold: 2 });

    target.mode = "up";
    let mon = await runOneCheck(m.id);
    expect(mon.status).toBe("UP");
    expect(mon.lastResponseTimeMs).not.toBeNull();
    expect(mon.lastStatusCode).toBe(200);

    target.mode = "down";
    mon = await runOneCheck(m.id);
    expect(mon.status).toBe("UP"); // one failure is not an outage
    mon = await runOneCheck(m.id);
    expect(mon.status).toBe("DOWN");

    const incident = await prisma.incident.findFirstOrThrow({ where: { monitorId: m.id } });
    expect(incident.resolvedAt).toBeNull();
    expect(incident.statusCode).toBe(503);

    const downMail = await waitFor(async () => (await mailpitMessages()).find((x) => x.Subject.startsWith("[DOWN] Checkout API")));
    expect(downMail.To[0]?.Address).toBe("alerts-e2e@example.com");
    await waitFor(async () => (await prisma.notification.findFirst({ where: { incidentId: incident.id, type: "INCIDENT_OPENED", status: "SENT" } })) !== null);

    target.mode = "up";
    await runOneCheck(m.id);
    mon = await runOneCheck(m.id);
    expect(mon.status).toBe("UP");

    const resolved = await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.durationSeconds).toBeGreaterThanOrEqual(0);

    await waitFor(async () => (await mailpitMessages()).find((x) => x.Subject.startsWith("[RECOVERED] Checkout API")));
    const sent = await waitFor(async () => {
      const rows = await prisma.notification.findMany({ where: { incidentId: incident.id, status: "SENT" } });
      return rows.length === 2 ? rows : null;
    });
    expect(sent.every((n) => n.attempts === 1 && n.sentAt !== null)).toBe(true);

    // Exactly one email per event.
    const all = await mailpitMessages();
    expect(all.filter((x) => x.Subject.includes("Checkout API"))).toHaveLength(2);
    expect(await prisma.incident.count({ where: { monitorId: m.id } })).toBe(1);
  });

  it("records timeouts for slow endpoints", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: target.url, timeoutMs: 1000, failureThreshold: 1 });
    target.mode = "slow";
    const mon = await runOneCheck(m.id);
    expect(mon.status).toBe("DOWN");
    const check = await prisma.check.findFirstOrThrow({ where: { monitorId: m.id } });
    expect(check.errorType).toBe("TIMEOUT");
    target.mode = "up";
  });

  it("does not run checks for paused monitors", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: target.url, status: "PAUSED", nextCheckAt: new Date(Date.now() - 1000) });
    const hits = target.hits;
    expect(await runtime.tick()).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(target.hits).toBe(hits);
    expect(await prisma.check.count({ where: { monitorId: m.id } })).toBe(0);
  });
});
