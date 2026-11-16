// Environment for API integration tests: an isolated database and Redis DB index.
export const TEST_DATABASE_URL =
  process.env.TEST_WEB_DATABASE_URL ?? "postgresql://uptimekit:uptimekit@localhost:5442/uptimekit_test_web";
export const TEST_REDIS_URL = process.env.TEST_WEB_REDIS_URL ?? "redis://localhost:6380/2";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "integration-test-secret-not-for-production-use",
  MAX_MONITORS_PER_USER: "8",
  MONITOR_MIN_INTERVAL_SECONDS: "30",
  CHECKER_ALLOW_CIDRS: "",
});
