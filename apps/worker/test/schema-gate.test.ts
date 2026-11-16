import type { PrismaClient } from "@uptimekit/database";
import { REQUIRED_MIGRATIONS, checkSchema } from "@uptimekit/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createWorkerRuntime } from "../src/runtime";
import { TEST_DATABASE_URL, TEST_REDIS_URL } from "./env";
import { createTestPrisma, testLogger } from "./helpers";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("deployment schema gate", () => {
  it("is ready when every required migration is applied", async () => {
    await expect(checkSchema(prisma)).resolves.toEqual({ ready: true, missing: [] });
    expect(REQUIRED_MIGRATIONS.length).toBeGreaterThan(0);
  });

  it("reports migrations a newer release needs but the database lacks", async () => {
    const status = await checkSchema(prisma, [...REQUIRED_MIGRATIONS, "29991231000000_future_change"]);
    expect(status).toEqual({ ready: false, missing: ["29991231000000_future_change"] });
  });

  it("the worker refuses to start against a database that is missing its migrations", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: TEST_REDIS_URL,
      WORKER_HEALTH_PORT: "0",
      SCHEMA_WAIT_TIMEOUT_MS: "0",
    });
    // A Prisma client whose $queryRaw sees no migrations table, like a fresh/unmigrated DB.
    const unmigrated = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === "$queryRaw") return () => Promise.reject(new Error('relation "_prisma_migrations" does not exist'));
        return Reflect.get(target, prop, receiver);
      },
    });
    const runtime = createWorkerRuntime(config, testLogger, { prisma: unmigrated, disableTimers: true });
    await expect(runtime.start()).rejects.toThrow(/schema not ready.*20261116203834_init/);
    await runtime.stop();
  });
});
