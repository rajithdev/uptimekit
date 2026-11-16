import { execSync } from "node:child_process";
import path from "node:path";
import { Redis } from "ioredis";
import { TEST_DATABASE_URL, TEST_REDIS_URL } from "./env";

export default async function setup() {
  // Apply migrations to the dedicated test database.
  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, "../../../packages/database"),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
  const redis = new Redis(TEST_REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}
