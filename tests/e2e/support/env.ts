// Isolated environment for the end-to-end suite (own database, Redis DB, and ports).
export const E2E = {
  webPort: Number(process.env.E2E_WEB_PORT ?? 3100),
  targetPort: Number(process.env.E2E_TARGET_PORT ?? 4010),
  workerHealthPort: Number(process.env.E2E_WORKER_HEALTH_PORT ?? 8181),
  databaseUrl: process.env.E2E_DATABASE_URL ?? "postgresql://uptimekit:uptimekit@localhost:5442/uptimekit_e2e",
  redisUrl: process.env.E2E_REDIS_URL ?? "redis://localhost:6380/3",
  mailpitApi: process.env.MAILPIT_API_URL ?? "http://localhost:8026",
  smtpPort: process.env.MAILPIT_SMTP_PORT ?? "1026",
};

export const appUrl = `http://localhost:${E2E.webPort}`;
export const targetUrl = `http://127.0.0.1:${E2E.targetPort}`;

/** Environment shared by the web server and the worker under test. */
export function serviceEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    DATABASE_URL: E2E.databaseUrl,
    REDIS_URL: E2E.redisUrl,
    APP_URL: appUrl,
    BETTER_AUTH_URL: appUrl,
    BETTER_AUTH_SECRET: "e2e-only-secret-value-not-for-production",
    // Test-only: allow the local target server, and fast schedules.
    UPTIMEKIT_E2E: "1",
    CHECKER_ALLOW_CIDRS: "127.0.0.1/32",
    MONITOR_MIN_INTERVAL_SECONDS: "5",
    SCHEDULER_TICK_MS: "500",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "localhost",
    SMTP_PORT: E2E.smtpPort,
    SMTP_SECURE: "false",
    WORKER_HEALTH_PORT: String(E2E.workerHealthPort),
    NOTIFICATION_BACKOFF_MS: "500",
    LOG_LEVEL: "warn",
  };
}
