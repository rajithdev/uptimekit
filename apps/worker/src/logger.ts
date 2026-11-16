import pino from "pino";

export function createLogger(level: string = process.env.LOG_LEVEL ?? "info") {
  return pino({
    level,
    base: { service: "uptimekit-worker" },
    // Defence in depth: never emit credentials even if an object containing them is logged.
    redact: {
      paths: ["*.password", "*.pass", "*.SMTP_PASSWORD", "*.DATABASE_URL", "*.REDIS_URL", "*.authorization", "*.cookie", "*.token", "*.RESEND_API_KEY", "*.apiKey"],
      censor: "[redacted]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
