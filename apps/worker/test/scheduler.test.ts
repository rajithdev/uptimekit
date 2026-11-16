import type { PrismaClient } from "@uptimekit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processCheckJob } from "../src/check-processor";
import { claimDueMonitors } from "../src/scheduler";
import { createMonitor, createTestPrisma, createUser, resetDatabase, testLogger } from "./helpers";

let prisma: PrismaClient;
let prisma2: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
  prisma2 = createTestPrisma(); // a second "worker process" with its own connection pool
});
afterAll(async () => {
  await Promise.all([prisma.$disconnect(), prisma2.$disconnect()]);
});
beforeEach(async () => {
  await resetDatabase(prisma);
});

describe("claimDueMonitors", () => {
  it("claims only due, active monitors and advances next_check_at by one interval", async () => {
    const user = await createUser(prisma);
    const now = new Date();
    const due = await createMonitor(prisma, user.id, { url: "https://a.example.com", nextCheckAt: new Date(now.getTime() - 1000) });
    await createMonitor(prisma, user.id, { url: "https://b.example.com", nextCheckAt: new Date(now.getTime() + 60_000) });
    await createMonitor(prisma, user.id, { url: "https://c.example.com", status: "PAUSED", nextCheckAt: new Date(now.getTime() - 1000) });

    const claimed = await claimDueMonitors(prisma, 100, now);
    expect(claimed.map((c) => c.id)).toEqual([due.id]);
    const after = await prisma.monitor.findUniqueOrThrow({ where: { id: due.id } });
    expect(after.nextCheckAt.getTime()).toBe(now.getTime() + 60_000);

    // Immediately claiming again yields nothing: no duplicate scheduling.
    expect(await claimDueMonitors(prisma, 100, now)).toEqual([]);
  });

  it("concurrent schedulers claim disjoint sets (no monitor is scheduled twice)", async () => {
    const user = await createUser(prisma);
    const past = new Date(Date.now() - 5000);
    for (let i = 0; i < 200; i++) {
      await createMonitor(prisma, user.id, { url: `https://m${i}.example.com`, nextCheckAt: past });
    }
    const now = new Date();
    const [a, b, c, d] = await Promise.all([
      claimDueMonitors(prisma, 80, now),
      claimDueMonitors(prisma2, 80, now),
      claimDueMonitors(prisma, 80, now),
      claimDueMonitors(prisma2, 80, now),
    ]);
    const ids = [...a, ...b, ...c, ...d].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids.length).toBe(200); // every due monitor claimed exactly once
  });

  it("respects the batch limit so a backlog is drained gradually", async () => {
    const user = await createUser(prisma);
    const past = new Date(Date.now() - 5000);
    for (let i = 0; i < 10; i++) await createMonitor(prisma, user.id, { url: `https://m${i}.example.com`, nextCheckAt: past });
    expect(await claimDueMonitors(prisma, 4)).toHaveLength(4);
    expect(await claimDueMonitors(prisma, 4)).toHaveLength(4);
    expect(await claimDueMonitors(prisma, 4)).toHaveLength(2);
  });
});

describe("processCheckJob", () => {
  const deps = () => ({
    prisma,
    queues: { notifications: { addBulk: async () => [] } as never },
    logger: testLogger,
    checkOptions: {},
    notificationRetry: { attempts: 3, backoffMs: 50 },
  });

  it("drops jobs that waited longer than one interval (workers fell behind)", async () => {
    const r = await processCheckJob(deps(), {
      monitorId: "x",
      scheduledFor: new Date().toISOString(),
      enqueuedAt: Date.now() - 120_000,
      intervalSeconds: 60,
    });
    expect(r).toEqual({ applied: false, reason: "stale_job" });
  });

  it("skips paused monitors without performing a request", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", status: "PAUSED" });
    const r = await processCheckJob(deps(), { monitorId: m.id, scheduledFor: new Date().toISOString(), enqueuedAt: Date.now(), intervalSeconds: 60 });
    expect(r).toEqual({ applied: false, reason: "monitor_paused" });
    expect(await prisma.check.count()).toBe(0);
  });

  it("records a BLOCKED failure when a stored URL now points at a private address", async () => {
    const user = await createUser(prisma);
    // e.g. a URL saved before a policy change, or inserted directly into the database
    const m = await createMonitor(prisma, user.id, { url: "http://169.254.169.254/latest/meta-data/", failureThreshold: 1 });
    const r = await processCheckJob(deps(), { monitorId: m.id, scheduledFor: new Date().toISOString(), enqueuedAt: Date.now(), intervalSeconds: 60 });
    expect(r).toMatchObject({ applied: true, status: "DOWN" });
    const check = await prisma.check.findFirstOrThrow({ where: { monitorId: m.id } });
    expect(check.errorType).toBe("INVALID_URL");
  });
});
