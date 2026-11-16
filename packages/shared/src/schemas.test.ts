import { describe, expect, it } from "vitest";
import {
  buildMonitorCreateSchema,
  buildMonitorUpdateSchema,
  incidentListQuerySchema,
  monitorListQuerySchema,
  notificationSettingsSchema,
} from "./schemas";
import { isExpectedStatus, parseExpectedStatusCodes } from "./status-codes";

const create = buildMonitorCreateSchema();

describe("monitor create schema", () => {
  it("applies defaults", () => {
    const r = create.parse({ name: " API ", url: "https://example.com/health" });
    expect(r).toMatchObject({
      name: "API",
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 10000,
      expectedStatusCodes: "200-299",
      keyword: null,
      followRedirects: true,
      failureThreshold: 2,
      recoveryThreshold: 2,
    });
  });

  it("rejects SSRF targets", () => {
    const r = create.safeParse({ name: "x", url: "http://169.254.169.254/latest/meta-data" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (no mass assignment)", () => {
    const r = create.safeParse({ name: "x", url: "https://example.com", userId: "someone-else", status: "UP" });
    expect(r.success).toBe(false);
  });

  it("enforces interval bounds and server minimum", () => {
    expect(create.safeParse({ name: "x", url: "https://example.com", intervalSeconds: 5 }).success).toBe(false);
    expect(buildMonitorCreateSchema({ minIntervalSeconds: 5 }).safeParse({ name: "x", url: "https://example.com", intervalSeconds: 5, timeoutMs: 2000 }).success).toBe(true);
    expect(create.safeParse({ name: "x", url: "https://example.com", intervalSeconds: 100000 }).success).toBe(false);
  });

  it("requires timeout shorter than interval", () => {
    const r = create.safeParse({ name: "x", url: "https://example.com", intervalSeconds: 30, timeoutMs: 30000 });
    expect(r.success).toBe(false);
  });

  it("rejects keyword with HEAD", () => {
    const r = create.safeParse({ name: "x", url: "https://example.com", method: "HEAD", keyword: "ok" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid status specs", () => {
    expect(create.safeParse({ name: "x", url: "https://example.com", expectedStatusCodes: "2xx" }).success).toBe(false);
    expect(create.safeParse({ name: "x", url: "https://example.com", expectedStatusCodes: "299-200" }).success).toBe(false);
  });

  it("rejects empty names and oversize names", () => {
    expect(create.safeParse({ name: "   ", url: "https://example.com" }).success).toBe(false);
    expect(create.safeParse({ name: "a".repeat(101), url: "https://example.com" }).success).toBe(false);
  });
});

describe("monitor update schema", () => {
  const update = buildMonitorUpdateSchema();
  it("accepts partial updates", () => {
    expect(update.parse({ name: "New" })).toEqual({ name: "New" });
  });
  it("rejects empty updates", () => {
    expect(update.safeParse({}).success).toBe(false);
  });
  it("still validates URLs", () => {
    expect(update.safeParse({ url: "http://10.0.0.1" }).success).toBe(false);
  });
});

describe("query schemas", () => {
  it("coerces pagination and applies defaults", () => {
    expect(monitorListQuerySchema.parse({ page: "2" })).toMatchObject({ page: 2, pageSize: 20, sort: "createdAt", order: "desc" });
  });
  it("caps page size", () => {
    expect(monitorListQuerySchema.safeParse({ pageSize: "1000" }).success).toBe(false);
  });
  it("validates incident filters", () => {
    expect(incidentListQuerySchema.safeParse({ status: "weird" }).success).toBe(false);
    expect(incidentListQuerySchema.parse({ status: "open" }).status).toBe("open");
  });
});

describe("notification settings schema", () => {
  it("normalises alert email", () => {
    expect(notificationSettingsSchema.parse({ alertEmail: "Ops@Example.com" }).alertEmail).toBe("ops@example.com");
    expect(notificationSettingsSchema.parse({ alertEmail: "" }).alertEmail).toBeNull();
  });
  it("rejects invalid emails", () => {
    expect(notificationSettingsSchema.safeParse({ alertEmail: "nope" }).success).toBe(false);
  });
});

describe("expected status codes", () => {
  it("parses ranges and lists", () => {
    expect(parseExpectedStatusCodes("200-299, 301,302")).toEqual([
      [200, 299],
      [301, 301],
      [302, 302],
    ]);
  });
  it("matches codes", () => {
    expect(isExpectedStatus(204, "200-299")).toBe(true);
    expect(isExpectedStatus(301, "200-299")).toBe(false);
    expect(isExpectedStatus(301, "200-299,301")).toBe(true);
  });
  it("rejects out-of-range codes", () => {
    expect(() => parseExpectedStatusCodes("99")).toThrow();
    expect(() => parseExpectedStatusCodes("600")).toThrow();
  });
});
