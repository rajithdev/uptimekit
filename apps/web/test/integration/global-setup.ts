import { prepareTestDatabase } from "@uptimekit/database/testing";
import { Redis } from "ioredis";
import { TEST_DATABASE_URL, TEST_REDIS_URL } from "./env";

export default async function setup() {
  await prepareTestDatabase(TEST_DATABASE_URL);
  const redis = new Redis(TEST_REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}
