import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createPrismaClient, type Monitor, type PrismaClient } from "@uptimekit/database";
import pino from "pino";
import { TEST_DATABASE_URL } from "./env";

export const testLogger = pino({ level: process.env.TEST_LOG_LEVEL ?? "silent" });

export function createTestPrisma(): PrismaClient {
  return createPrismaClient({ connectionString: TEST_DATABASE_URL, maxConnections: 20 });
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE notifications, incidents, check_rollups_hourly, checks, monitors, notification_settings, sessions, accounts, verifications, users RESTART IDENTITY CASCADE`,
  );
}

export async function createUser(prisma: PrismaClient, email = `user-${randomUUID()}@example.com`) {
  return prisma.user.create({ data: { id: randomUUID(), name: "Test User", email } });
}

export async function createMonitor(
  prisma: PrismaClient,
  userId: string,
  data: Partial<Omit<Monitor, "id" | "userId">> & { url: string },
): Promise<Monitor> {
  return prisma.monitor.create({
    data: {
      userId,
      name: data.name ?? "Test monitor",
      intervalSeconds: 60,
      timeoutMs: 2000,
      failureThreshold: 2,
      recoveryThreshold: 2,
      retryIntervalSeconds: 5,
      ...data,
    },
  });
}

/** A deterministic local HTTP endpoint whose behaviour tests can flip at runtime. */
export interface TargetServer {
  url: string;
  mode: "up" | "down" | "slow";
  hits: number;
  close(): Promise<void>;
}

export async function startTargetServer(): Promise<TargetServer> {
  const state = { mode: "up" as TargetServer["mode"], hits: 0 };
  const server = http.createServer((_req, res) => {
    state.hits += 1;
    if (state.mode === "up") res.writeHead(200, { "content-type": "text/plain" }).end("ok: healthy");
    else if (state.mode === "down") res.writeHead(503).end("service unavailable");
    else setTimeout(() => res.writeHead(200).end("slow"), 5000);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/health`,
    get mode() {
      return state.mode;
    },
    set mode(m) {
      state.mode = m;
    },
    get hits() {
      return state.hits;
    },
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 15_000, intervalMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms${last ? `: ${String(last)}` : ""}`);
}

export const up = { result: "UP" as const, responseTimeMs: 42, statusCode: 200, errorType: null, errorMessage: null };
export const down = {
  result: "DOWN" as const,
  responseTimeMs: 30,
  statusCode: 503,
  errorType: "STATUS" as const,
  errorMessage: "Unexpected HTTP status 503 (expected 200-299)",
};

export const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);
