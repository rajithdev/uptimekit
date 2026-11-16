import type { PrismaClient } from "@uptimekit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyCheckResult } from "../src/apply-result";
import { at, createMonitor, createTestPrisma, createUser, down, resetDatabase, up } from "./helpers";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(prisma);
});

const t0 = new Date("2026-03-01T10:00:00.000Z");

describe("applyCheckResult — incident lifecycle", () => {
  it("records checks, confirms an outage, opens one incident, and resolves it with duration", async () => {
    const user = await createUser(prisma, "owner@example.com");
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", failureThreshold: 2, recoveryThreshold: 2 });

    // Healthy
    let r = await applyCheckResult(prisma, m.id, up, at(t0, 0));
    expect(r).toMatchObject({ applied: true, status: "UP", transition: "BECAME_UP", incident: null });

    // First failure: not yet confirmed, faster retry scheduled
    r = await applyCheckResult(prisma, m.id, down, at(t0, 60));
    expect(r).toMatchObject({ status: "UP", transition: "NONE", incident: null });
    let mon = await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } });
    expect(mon.consecutiveFailures).toBe(1);
    expect(mon.nextCheckAt.getTime()).toBe(at(t0, 65).getTime()); // retryIntervalSeconds = 5

    // Second failure: confirmed DOWN, incident opened at the FIRST failure
    r = await applyCheckResult(prisma, m.id, down, at(t0, 65));
    expect(r).toMatchObject({ status: "DOWN", transition: "WENT_DOWN", incident: { action: "OPENED" } });
    expect(r.applied && r.pendingNotificationIds).toHaveLength(1);
    const incident = await prisma.incident.findFirstOrThrow({ where: { monitorId: m.id } });
    expect(incident.startedAt.toISOString()).toBe(at(t0, 60).toISOString());
    expect(incident.resolvedAt).toBeNull();
    expect(incident.cause).toMatch(/503/);
    expect(incident.statusCode).toBe(503);

    // Continued failure: no duplicate incident or notification
    r = await applyCheckResult(prisma, m.id, down, at(t0, 125));
    expect(r).toMatchObject({ status: "DOWN", incident: null, pendingNotificationIds: [] });

    // First success: recovery not yet confirmed
    r = await applyCheckResult(prisma, m.id, up, at(t0, 185));
    expect(r).toMatchObject({ status: "DOWN", incident: null });

    // Second success: recovered. Resolution time is the first success of the streak.
    r = await applyCheckResult(prisma, m.id, up, at(t0, 190));
    expect(r).toMatchObject({ status: "UP", transition: "RECOVERED", incident: { action: "RESOLVED", id: incident.id } });
    const resolved = await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(resolved.resolvedAt?.toISOString()).toBe(at(t0, 185).toISOString());
    expect(resolved.durationSeconds).toBe(125);

    const notifications = await prisma.notification.findMany({ where: { incidentId: incident.id }, orderBy: { createdAt: "asc" } });
    expect(notifications.map((n) => [n.type, n.status, n.recipient])).toEqual([
      ["INCIDENT_OPENED", "PENDING", "owner@example.com"],
      ["INCIDENT_RESOLVED", "PENDING", "owner@example.com"],
    ]);

    expect(await prisma.check.count({ where: { monitorId: m.id } })).toBe(6);
    mon = await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } });
    expect(mon).toMatchObject({ status: "UP", consecutiveSuccesses: 2, consecutiveFailures: 0, lastError: null });
    expect(mon.lastStatusChangeAt?.toISOString()).toBe(at(t0, 190).toISOString());
  });

  it("does not date an incident before a resume (failures before a pause don't count)", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", failureThreshold: 2 });
    await applyCheckResult(prisma, m.id, down, at(t0, 0)); // one failure, then paused
    const resumedAt = at(t0, 600);
    // What resume does: back to PENDING with counters reset and a fresh status-change time.
    await prisma.monitor.update({
      where: { id: m.id },
      data: { status: "PENDING", consecutiveFailures: 0, consecutiveSuccesses: 0, lastStatusChangeAt: resumedAt },
    });
    await applyCheckResult(prisma, m.id, down, at(t0, 610));
    const r = await applyCheckResult(prisma, m.id, down, at(t0, 615));
    expect(r).toMatchObject({ status: "DOWN", incident: { action: "OPENED" } });
    const incident = await prisma.incident.findFirstOrThrow({ where: { monitorId: m.id } });
    expect(incident.startedAt.toISOString()).toBe(at(t0, 610).toISOString());
  });

  it("maintains hourly rollups in the same transaction", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com" });
    await applyCheckResult(prisma, m.id, { ...up, responseTimeMs: 100 }, at(t0, 0));
    await applyCheckResult(prisma, m.id, { ...up, responseTimeMs: 300 }, at(t0, 60));
    await applyCheckResult(prisma, m.id, { ...down, responseTimeMs: null, statusCode: null }, at(t0, 120));
    await applyCheckResult(prisma, m.id, up, at(t0, 3600)); // next hour

    const rollups = await prisma.checkRollupHourly.findMany({ where: { monitorId: m.id }, orderBy: { hour: "asc" } });
    expect(rollups).toHaveLength(2);
    expect(rollups[0]).toMatchObject({
      totalChecks: 3,
      upChecks: 2,
      downChecks: 1,
      responseTimeSumMs: 400n,
      responseTimeCount: 2,
      minResponseTimeMs: 100,
      maxResponseTimeMs: 300,
    });
    expect(rollups[1]).toMatchObject({ totalChecks: 1, upChecks: 1 });
  });

  it("records but does not evaluate out-of-order results", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", failureThreshold: 1 });
    await applyCheckResult(prisma, m.id, up, at(t0, 60));
    const r = await applyCheckResult(prisma, m.id, down, at(t0, 30)); // started earlier, finished later
    expect(r).toMatchObject({ applied: true, evaluated: false, status: "UP" });
    expect(await prisma.incident.count()).toBe(0);
    expect(await prisma.check.count()).toBe(2);
  });

  it("discards results for paused and deleted monitors", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", status: "PAUSED", pausedAt: t0 });
    expect(await applyCheckResult(prisma, m.id, down, t0)).toEqual({ applied: false, reason: "monitor_paused" });
    expect(await applyCheckResult(prisma, "does-not-exist", down, t0)).toEqual({ applied: false, reason: "monitor_deleted" });
    expect(await prisma.check.count()).toBe(0);
  });

  it("respects notification preferences and keeps SKIPPED rows for audit", async () => {
    const user = await createUser(prisma, "quiet@example.com");
    await prisma.notificationSettings.create({ data: { userId: user.id, notifyOnDown: false, alertEmail: "oncall@example.com" } });
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", failureThreshold: 1, recoveryThreshold: 1 });
    const opened = await applyCheckResult(prisma, m.id, down, at(t0, 0));
    expect(opened.applied && opened.pendingNotificationIds).toEqual([]);
    const resolved = await applyCheckResult(prisma, m.id, up, at(t0, 60));
    expect(resolved.applied && resolved.pendingNotificationIds).toHaveLength(1);

    const rows = await prisma.notification.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((n) => [n.type, n.status, n.recipient])).toEqual([
      ["INCIDENT_OPENED", "SKIPPED", "oncall@example.com"],
      ["INCIDENT_RESOLVED", "PENDING", "oncall@example.com"],
    ]);
  });

  it("skips notifications when disabled on the monitor", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", failureThreshold: 1, notificationsEnabled: false });
    await applyCheckResult(prisma, m.id, down, t0);
    const n = await prisma.notification.findFirstOrThrow();
    expect(n.status).toBe("SKIPPED");
  });
});

describe("concurrency guarantees", () => {
  it("parallel failing results from many workers open exactly one incident and one notification", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com", failureThreshold: 1 });

    // Simulate 25 workers applying failures for the same monitor at the same moment.
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => applyCheckResult(prisma, m.id, down, at(t0, i))),
    );
    expect(results.every((r) => r.applied)).toBe(true);
    expect(await prisma.incident.count({ where: { monitorId: m.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { monitorId: m.id } })).toBe(1);
    expect(await prisma.check.count({ where: { monitorId: m.id } })).toBe(25);
    const opened = results.filter((r) => r.applied && r.incident?.action === "OPENED");
    expect(opened).toHaveLength(1);
  });

  it("the database itself rejects a second open incident for a monitor", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com" });
    const base = { monitorId: m.id, userId: user.id, startedAt: t0, cause: "x" };
    await prisma.incident.create({ data: base });
    await expect(prisma.incident.create({ data: base })).rejects.toThrow();
    // A resolved incident does not block a new open one.
    await prisma.incident.updateMany({ where: { monitorId: m.id }, data: { resolvedAt: at(t0, 10) } });
    await expect(prisma.incident.create({ data: { ...base, startedAt: at(t0, 20) } })).resolves.toBeTruthy();
  });

  it("the database rejects duplicate notifications for the same incident event", async () => {
    const user = await createUser(prisma);
    const m = await createMonitor(prisma, user.id, { url: "https://example.com" });
    const inc = await prisma.incident.create({ data: { monitorId: m.id, userId: user.id, startedAt: t0, cause: "x" } });
    const data = { userId: user.id, monitorId: m.id, incidentId: inc.id, type: "INCIDENT_OPENED" as const, recipient: "a@b.co" };
    await prisma.notification.create({ data });
    await expect(prisma.notification.create({ data })).rejects.toThrow();
  });
});
