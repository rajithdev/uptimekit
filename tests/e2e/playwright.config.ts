import { defineConfig, devices } from "@playwright/test";
import { E2E, appUrl, serviceEnv, targetUrl } from "./support/env";

/**
 * End-to-end suite: a production build of the web app, the real worker, a deterministic local
 * target server, and Postgres/Redis/Mailpit from docker-compose. Nothing is mocked.
 *
 * Prerequisites: `pnpm infra:up` and `pnpm build` (CI does both). Run via `pnpm test:e2e`, which
 * prepares an isolated database first.
 */
export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --experimental-strip-types support/target-server.ts",
      url: `${targetUrl}/__ping`,
      env: { E2E_TARGET_PORT: String(E2E.targetPort) },
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @uptimekit/web start",
      url: `${appUrl}/api/health`,
      env: { ...serviceEnv(), PORT: String(E2E.webPort), HOSTNAME: "127.0.0.1" },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @uptimekit/worker exec tsx src/main.ts",
      url: `http://127.0.0.1:${E2E.workerHealthPort}/healthz`,
      env: { ...serviceEnv(), NODE_ENV: "test" },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
