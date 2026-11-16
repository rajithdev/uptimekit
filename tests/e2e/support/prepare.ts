// Runs BEFORE Playwright (see package.json "test"): Playwright starts webServers before
// globalSetup, and the web app + worker need a migrated, empty database at boot.
import { createPrismaClient } from "@uptimekit/database";
import { prepareTestDatabase } from "@uptimekit/database/testing";
import { Redis } from "ioredis";
import { E2E } from "./env";

await prepareTestDatabase(E2E.databaseUrl);
const prisma = createPrismaClient({ connectionString: E2E.databaseUrl });
await prisma.$executeRawUnsafe(
  `TRUNCATE notifications, incidents, check_rollups_hourly, checks, monitors, notification_settings, sessions, accounts, verifications, rate_limits, users RESTART IDENTITY CASCADE`,
);
await prisma.$disconnect();
const redis = new Redis(E2E.redisUrl);
await redis.flushdb();
await redis.quit();
await fetch(`${E2E.mailpitApi}/api/v1/messages`, { method: "DELETE" }).catch(() => undefined);
console.log("e2e: database, redis and mailbox prepared");
