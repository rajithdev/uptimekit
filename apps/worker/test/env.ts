export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://uptimekit:uptimekit@localhost:5442/uptimekit_test";
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6380/1";
export const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? "http://localhost:8026";
export const MAILPIT_SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? 1026);
