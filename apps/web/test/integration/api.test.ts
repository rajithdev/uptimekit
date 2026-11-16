import { getPrisma } from "@uptimekit/database";
import { beforeEach, describe, expect, it } from "vitest";
import * as dashboard from "@/app/api/v1/dashboard/summary/route";
import * as incidentDetail from "@/app/api/v1/incidents/[id]/route";
import * as incidents from "@/app/api/v1/incidents/route";
import * as checks from "@/app/api/v1/monitors/[id]/checks/route";
import * as pause from "@/app/api/v1/monitors/[id]/pause/route";
import * as resume from "@/app/api/v1/monitors/[id]/resume/route";
import * as monitor from "@/app/api/v1/monitors/[id]/route";
import * as stats from "@/app/api/v1/monitors/[id]/stats/route";
import * as monitors from "@/app/api/v1/monitors/route";
import * as notificationSettings from "@/app/api/v1/notification-settings/route";
import * as notifications from "@/app/api/v1/notifications/route";
import * as health from "@/app/api/health/route";
import { BASE, call, resetDatabase, signIn, signUp, type TestUser } from "./helpers";

const prisma = getPrisma();

beforeEach(async () => {
  await resetDatabase();
});

async function createMonitor(user: TestUser, body: Record<string, unknown> = {}) {
  const res = await call(monitors.POST, {
    method: "POST",
    user,
    body: { name: "Homepage", url: "https://example.com", ...body },
  });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json.data as { id: string; [k: string]: unknown };
}

describe("authentication", () => {
  it("registers, stores a hashed password, and issues an httpOnly session cookie", async () => {
    const res = await (async () => {
      const { auth } = await import("@/lib/server/auth");
      return auth().handler(
        new Request(`${BASE}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "198.51.100.7" },
          body: JSON.stringify({ email: "Alice@Example.com", password: "s3cure-passphrase", name: "Alice" }),
        }),
      );
    })();
    expect(res.status).toBe(200);
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/uptimekit\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const account = await prisma.account.findFirstOrThrow({ where: { providerId: "credential" } });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain("s3cure-passphrase");
    expect(account.password!.length).toBeGreaterThan(40);
  });

  it("signs in with the right password and rejects the wrong one", async () => {
    const u = await signUp("bob@example.com", "right-password-123");
    expect(u.cookie).toMatch(/session_token/);
    expect((await signIn("bob@example.com", "right-password-123")).status).toBe(200);
    expect((await signIn("bob@example.com", "wrong-password-123")).status).toBe(401);
  });

  it("rate-limits repeated sign-in attempts from one IP", async () => {
    await signUp("carol@example.com", "right-password-123");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await signIn("carol@example.com", "nope-nope-nope", "192.0.2.99")).status);
    expect(statuses).toContain(429);
  });

  it("rejects unauthenticated access to every protected endpoint", async () => {
    const p = { id: "x" };
    const results = await Promise.all([
      call(monitors.GET),
      call(monitors.POST, { method: "POST", body: { name: "x", url: "https://example.com" } }),
      call(monitor.GET, { params: p }),
      call(monitor.PATCH, { method: "PATCH", params: p, body: { name: "y" } }),
      call(monitor.DELETE, { method: "DELETE", params: p }),
      call(pause.POST, { method: "POST", params: p }),
      call(resume.POST, { method: "POST", params: p }),
      call(checks.GET, { params: p }),
      call(stats.GET, { params: p }),
      call(incidents.GET),
      call(incidentDetail.GET, { params: p }),
      call(notificationSettings.GET),
      call(notificationSettings.PUT, { method: "PUT", body: {} }),
      call(notifications.GET),
      call(dashboard.GET),
    ]);
    for (const r of results) {
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("rejects a forged session cookie", async () => {
    const r = await call(monitors.GET, { headers: { cookie: "uptimekit.session_token=forged.value" } });
    expect(r.status).toBe(401);
  });
});

describe("monitor CRUD", () => {
  it("creates with defaults, reads, updates, and deletes", async () => {
    const u = await signUp();
    const m = await createMonitor(u, { name: "API", url: "https://api.example.com/health" });
    expect(m).toMatchObject({ name: "API", method: "GET", intervalSeconds: 60, status: "PENDING", failureThreshold: 2 });

    const got = await call(monitor.GET, { user: u, params: { id: m.id } });
    expect(got.status).toBe(200);
    expect(got.json.data.url).toBe("https://api.example.com/health");

    const upd = await call(monitor.PATCH, { method: "PATCH", user: u, params: { id: m.id }, body: { name: "API v2", intervalSeconds: 120 } });
    expect(upd.status).toBe(200);
    expect(upd.json.data).toMatchObject({ name: "API v2", intervalSeconds: 120 });

    const del = await call(monitor.DELETE, { method: "DELETE", user: u, params: { id: m.id } });
    expect(del.status).toBe(204);
    expect((await call(monitor.GET, { user: u, params: { id: m.id } })).status).toBe(404);
  });

  it("returns structured validation errors", async () => {
    const u = await signUp();
    const r = await call(monitors.POST, { method: "POST", user: u, body: { name: "", url: "nope", intervalSeconds: 1 } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("VALIDATION_ERROR");
    const paths = r.json.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "url", "intervalSeconds"]));
  });

  it.each([
    "http://localhost:8080",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://10.0.0.1/admin",
    "http://metadata.google.internal/",
    "file:///etc/passwd",
    "http://2130706433/",
  ])("rejects SSRF target %s", async (url) => {
    const u = await signUp();
    const r = await call(monitors.POST, { method: "POST", user: u, body: { name: "x", url } });
    expect(r.status).toBe(400);
  });

  it("rejects SSRF targets on update too", async () => {
    const u = await signUp();
    const m = await createMonitor(u);
    const r = await call(monitor.PATCH, { method: "PATCH", user: u, params: { id: m.id }, body: { url: "http://192.168.1.1" } });
    expect(r.status).toBe(400);
  });

  it("rejects mass-assignment of server-owned fields", async () => {
    const u = await signUp();
    const r = await call(monitors.POST, { method: "POST", user: u, body: { name: "x", url: "https://example.com", status: "UP", userId: "other" } });
    expect(r.status).toBe(400);
  });

  it("validates cross-field rules against the merged monitor on update", async () => {
    const u = await signUp();
    const m = await createMonitor(u, { keyword: "ok" });
    const r = await call(monitor.PATCH, { method: "PATCH", user: u, params: { id: m.id }, body: { method: "HEAD" } });
    expect(r.status).toBe(400);
    expect(r.json.error.details[0].path).toBe("keyword");
  });

  it("requires JSON content type and well-formed JSON", async () => {
    const u = await signUp();
    const a = await call(monitors.POST, { method: "POST", user: u, rawBody: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(a.status).toBe(415);
    const b = await call(monitors.POST, { method: "POST", user: u, rawBody: "{not json" });
    expect(b.status).toBe(400);
  });

  it("rejects cross-origin browser writes (CSRF)", async () => {
    const u = await signUp();
    const r = await call(monitors.POST, {
      method: "POST",
      user: u,
      headers: { origin: "https://evil.example" },
      body: { name: "x", url: "https://example.com" },
    });
    expect(r.status).toBe(403);
    const ok = await call(monitors.POST, { method: "POST", user: u, headers: { origin: BASE }, body: { name: "x", url: "https://example.com" } });
    expect(ok.status).toBe(201);
  });

  it("enforces the per-user monitor cap", async () => {
    const u = await signUp();
    for (let i = 0; i < 8; i++) {
      await prisma.monitor.create({ data: { userId: u.id, name: `m${i}`, url: "https://example.com" } });
    }
    const r = await call(monitors.POST, { method: "POST", user: u, body: { name: "one too many", url: "https://example.com" } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("LIMIT_EXCEEDED");
  });

  it("rate-limits monitor creation", async () => {
    const u = await signUp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await call(monitors.POST, { method: "POST", user: u, body: { name: `m${i}`, url: "https://example.com" } });
      statuses.push(r.status);
      // keep under the monitor cap so the limiter is what trips
      if (r.status === 201) await prisma.monitor.delete({ where: { id: r.json.data.id } });
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("paginates, sorts and filters", async () => {
    const u = await signUp();
    for (const [name, status] of [["b", "UP"], ["a", "DOWN"], ["c", "UP"]] as const) {
      await prisma.monitor.create({ data: { userId: u.id, name, url: `https://${name}.example.com`, status } });
    }
    const page1 = await call(monitors.GET, { user: u, query: { sort: "name", order: "asc", pageSize: "2" } });
    expect(page1.json.data.map((m: { name: string }) => m.name)).toEqual(["a", "b"]);
    expect(page1.json.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    const page2 = await call(monitors.GET, { user: u, query: { sort: "name", order: "asc", pageSize: "2", page: "2" } });
    expect(page2.json.data.map((m: { name: string }) => m.name)).toEqual(["c"]);
    const up = await call(monitors.GET, { user: u, query: { status: "UP" } });
    expect(up.json.data).toHaveLength(2);
    const search = await call(monitors.GET, { user: u, query: { q: "c.example" } });
    expect(search.json.data).toHaveLength(1);
    const bad = await call(monitors.GET, { user: u, query: { sort: "password" } });
    expect(bad.status).toBe(400);
  });
});

describe("pause / resume", () => {
  it("pauses (closing any open incident) and resumes as PENDING", async () => {
    const u = await signUp();
    const m = await createMonitor(u);
    await prisma.monitor.update({ where: { id: m.id }, data: { status: "DOWN" } });
    const inc = await prisma.incident.create({ data: { monitorId: m.id, userId: u.id, startedAt: new Date(Date.now() - 60_000), cause: "x" } });

    const p = await call(pause.POST, { method: "POST", user: u, params: { id: m.id } });
    expect(p.status).toBe(200);
    expect(p.json.data).toMatchObject({ status: "PAUSED" });
    expect(p.json.data.pausedAt).toBeTruthy();
    const closed = await prisma.incident.findUniqueOrThrow({ where: { id: inc.id } });
    expect(closed.resolvedAt).not.toBeNull();
    expect(closed.durationSeconds).toBeGreaterThanOrEqual(59);

    const r = await call(resume.POST, { method: "POST", user: u, params: { id: m.id } });
    expect(r.json.data).toMatchObject({ status: "PENDING", pausedAt: null });
  });
});

describe("user data isolation", () => {
  it("never exposes or mutates another user's monitors, checks, stats or incidents", async () => {
    const alice = await signUp();
    const mallory = await signUp();
    const m = await createMonitor(alice, { name: "Alice private" });
    await prisma.check.create({ data: { monitorId: m.id, checkedAt: new Date(), result: "UP", responseTimeMs: 10 } });
    const inc = await prisma.incident.create({ data: { monitorId: m.id, userId: alice.id, startedAt: new Date(), cause: "x" } });
    const p = { id: m.id };

    const attempts = await Promise.all([
      call(monitor.GET, { user: mallory, params: p }),
      call(monitor.PATCH, { method: "PATCH", user: mallory, params: p, body: { name: "pwned" } }),
      call(monitor.DELETE, { method: "DELETE", user: mallory, params: p }),
      call(pause.POST, { method: "POST", user: mallory, params: p }),
      call(resume.POST, { method: "POST", user: mallory, params: p }),
      call(checks.GET, { user: mallory, params: p }),
      call(stats.GET, { user: mallory, params: p }),
      call(incidentDetail.GET, { user: mallory, params: { id: inc.id } }),
    ]);
    for (const a of attempts) expect(a.status).toBe(404);

    expect((await call(monitors.GET, { user: mallory })).json.data).toEqual([]);
    expect((await call(incidents.GET, { user: mallory })).json.data).toEqual([]);
    expect((await call(incidents.GET, { user: mallory, query: { monitorId: m.id } })).json.data).toEqual([]);
    expect((await call(dashboard.GET, { user: mallory })).json.data.totals.monitors).toBe(0);

    const still = await prisma.monitor.findUniqueOrThrow({ where: { id: m.id } });
    expect(still.name).toBe("Alice private");
    expect(still.status).toBe("PENDING");
  });
});

describe("history, statistics and incidents", () => {
  it("computes uptime from recorded checks and never reports missing data as uptime", async () => {
    const u = await signUp();
    const m = await createMonitor(u);
    const empty = await call(stats.GET, { user: u, params: { id: m.id }, query: { range: "24h" } });
    expect(empty.status).toBe(200);
    expect(empty.json.data.uptime).toBeNull();
    expect(empty.json.data.totalChecks).toBe(0);

    // Backdate creation so 24h of expected checks exist, then record 4 checks: 3 up, 1 down.
    await prisma.monitor.update({ where: { id: m.id }, data: { createdAt: new Date(Date.now() - 48 * 3600_000) } });
    const now = Date.now();
    const rows = [
      { result: "UP", responseTimeMs: 100 },
      { result: "UP", responseTimeMs: 200 },
      { result: "DOWN", responseTimeMs: null },
      { result: "UP", responseTimeMs: 300 },
    ] as const;
    for (const [i, r] of rows.entries()) {
      await prisma.check.create({ data: { monitorId: m.id, checkedAt: new Date(now - (i + 1) * 60_000), ...r } });
    }
    const s = await call(stats.GET, { user: u, params: { id: m.id }, query: { range: "24h" } });
    expect(s.json.data).toMatchObject({ uptime: 75, totalChecks: 4, upChecks: 3, downChecks: 1, source: "checks" });
    expect(s.json.data.latency).toMatchObject({ avg: 200, min: 100, max: 300, p50: 200 });
    expect(s.json.data.expectedChecks).toBe(1440);
    expect(s.json.data.coverage).toBeLessThan(0.01); // 4 of 1440 — low coverage is surfaced, not hidden
    // 15-minute buckets; an unaligned 24h window touches 96 or 97 buckets.
    expect([96, 97]).toContain(s.json.data.series.length);

    const page = await call(checks.GET, { user: u, params: { id: m.id }, query: { pageSize: "2", result: "UP" } });
    expect(page.json.pagination.total).toBe(3);
    expect(page.json.data).toHaveLength(2);
    expect(typeof page.json.data[0].id).toBe("string");
  });

  it("uses hourly rollups for 7d/30d and computes downtime from incidents", async () => {
    const u = await signUp();
    const m = await createMonitor(u);
    const hour = new Date(Math.floor(Date.now() / 3600_000) * 3600_000 - 2 * 3600_000);
    await prisma.checkRollupHourly.create({
      data: { monitorId: m.id, hour, totalChecks: 60, upChecks: 57, downChecks: 3, responseTimeSumMs: 5700, responseTimeCount: 57, minResponseTimeMs: 50, maxResponseTimeMs: 400 },
    });
    await prisma.incident.create({
      data: { monitorId: m.id, userId: u.id, startedAt: new Date(hour.getTime() + 600_000), resolvedAt: new Date(hour.getTime() + 780_000), durationSeconds: 180, cause: "x" },
    });
    const s = await call(stats.GET, { user: u, params: { id: m.id }, query: { range: "7d" } });
    expect(s.json.data).toMatchObject({ source: "rollups", uptime: 95, totalChecks: 60 });
    expect(s.json.data.latency).toMatchObject({ avg: 100, min: 50, max: 400, p95: null });
    expect(s.json.data.incidents).toEqual({ count: 1, downtimeSeconds: 180 });
    expect(s.json.data.daily).toHaveLength(30);
    const bad = await call(stats.GET, { user: u, params: { id: m.id }, query: { range: "1y" } });
    expect(bad.status).toBe(400);
  });

  it("lists and filters incidents and shows incident detail with notifications", async () => {
    const u = await signUp();
    const m = await createMonitor(u, { name: "Payments" });
    const open = await prisma.incident.create({ data: { monitorId: m.id, userId: u.id, startedAt: new Date(), cause: "Timed out after 10000ms", errorType: "TIMEOUT" } });
    await prisma.incident.create({
      data: { monitorId: m.id, userId: u.id, startedAt: new Date(Date.now() - 7200_000), resolvedAt: new Date(Date.now() - 7000_000), durationSeconds: 200, cause: "503" },
    });
    await prisma.notification.create({ data: { userId: u.id, monitorId: m.id, incidentId: open.id, type: "INCIDENT_OPENED", recipient: u.email, status: "SENT", attempts: 1 } });

    const all = await call(incidents.GET, { user: u });
    expect(all.json.pagination.total).toBe(2);
    expect(all.json.data[0].monitor.name).toBe("Payments");
    expect((await call(incidents.GET, { user: u, query: { status: "open" } })).json.data).toHaveLength(1);
    expect((await call(incidents.GET, { user: u, query: { status: "resolved" } })).json.data).toHaveLength(1);

    const detail = await call(incidentDetail.GET, { user: u, params: { id: open.id } });
    expect(detail.json.data).toMatchObject({ id: open.id, cause: "Timed out after 10000ms", resolvedAt: null });
    expect(detail.json.data.notifications[0]).toMatchObject({ type: "INCIDENT_OPENED", status: "SENT" });

    const log = await call(notifications.GET, { user: u });
    expect(log.json.data).toHaveLength(1);
  });

  it("summarises the dashboard from recorded data", async () => {
    const u = await signUp();
    const a = await createMonitor(u, { name: "a" });
    const b = await createMonitor(u, { name: "b" });
    await prisma.monitor.update({ where: { id: a.id }, data: { status: "UP" } });
    await prisma.monitor.update({ where: { id: b.id }, data: { status: "DOWN" } });
    await prisma.check.createMany({
      data: [
        { monitorId: a.id, checkedAt: new Date(), result: "UP", responseTimeMs: 100 },
        { monitorId: b.id, checkedAt: new Date(), result: "DOWN", responseTimeMs: 300 },
        { monitorId: b.id, checkedAt: new Date(), result: "UP", responseTimeMs: 200 },
      ],
    });
    await prisma.incident.create({ data: { monitorId: b.id, userId: u.id, startedAt: new Date(), cause: "x" } });
    const d = await call(dashboard.GET, { user: u });
    expect(d.json.data.totals).toMatchObject({ monitors: 2, up: 1, down: 1 });
    expect(d.json.data.averageUptime24h).toBe(75); // mean of 100% and 50%
    expect(d.json.data.averageResponseTimeMs24h).toBe(200);
    expect(d.json.data.openIncidents).toBe(1);
    expect(d.json.data.checksLast24h).toBe(3);
    expect(d.json.data.responseTimeSeries).toHaveLength(24);
  });
});

describe("notification settings", () => {
  it("returns defaults, updates, and validates", async () => {
    const u = await signUp();
    const g = await call(notificationSettings.GET, { user: u });
    expect(g.json.data).toEqual({ emailEnabled: true, notifyOnDown: true, notifyOnRecovery: true, alertEmail: null, accountEmail: u.email });
    const p = await call(notificationSettings.PUT, { method: "PUT", user: u, body: { notifyOnRecovery: false, alertEmail: "OnCall@Example.com" } });
    expect(p.json.data).toMatchObject({ notifyOnRecovery: false, alertEmail: "oncall@example.com", emailEnabled: true });
    const bad = await call(notificationSettings.PUT, { method: "PUT", user: u, body: { alertEmail: "not-an-email" } });
    expect(bad.status).toBe(400);
  });
});

describe("health", () => {
  it("reports database connectivity", async () => {
    const res = await health.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", dependencies: { database: true, schema: true } });
  });
});
