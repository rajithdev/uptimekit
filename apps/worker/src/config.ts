import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  APP_URL: z.url().default("http://localhost:3000"),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(500).default(20),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(8081),
  SCHEDULER_TICK_MS: z.coerce.number().int().min(200).max(60_000).default(2000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).default(500),
  /** Stop claiming new checks when this many are already waiting (backpressure). */
  MAX_QUEUED_CHECKS: z.coerce.number().int().min(10).default(5000),
  CHECK_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),

  EMAIL_PROVIDER: z.enum(["smtp", "resend", "console"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_API_URL: z.url().default("https://api.resend.com"),
  EMAIL_FROM: z.string().default("UptimeKit <alerts@uptimekit.local>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1026),
  SMTP_SECURE: boolish,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
  NOTIFICATION_BACKOFF_MS: z.coerce.number().int().min(10).max(3_600_000).default(5_000),

  CHECKER_ALLOW_CIDRS: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type WorkerConfig = z.infer<typeof schema> & { allowCidrs: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid worker configuration: ${details}`);
  }
  if (parsed.data.EMAIL_PROVIDER === "resend" && !parsed.data.RESEND_API_KEY) {
    throw new Error("Invalid worker configuration: RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  const allowCidrs = parsed.data.CHECKER_ALLOW_CIDRS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...parsed.data, allowCidrs };
}
