import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  APP_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
  BETTER_AUTH_URL: z.url().optional(),
  MONITOR_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  MAX_MONITORS_PER_USER: z.coerce.number().int().min(1).max(10_000).default(50),
  CHECKER_ALLOW_CIDRS: z.string().optional().default(""),
  AUTH_RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

export type ServerEnv = z.infer<typeof schema> & { allowCidrs: string[] };

let cached: ServerEnv | null = null;

/** Parsed lazily so `next build` can run without runtime secrets present. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }
  // The SSRF escape hatch is refused in production builds. The only exception is the
  // Playwright suite, which runs a production build against a 127.0.0.1 target server and
  // opts in explicitly with UPTIMEKIT_E2E=1.
  if (parsed.data.NODE_ENV === "production" && parsed.data.CHECKER_ALLOW_CIDRS && process.env.UPTIMEKIT_E2E !== "1") {
    throw new Error("CHECKER_ALLOW_CIDRS must not be set in production");
  }
  cached = {
    ...parsed.data,
    allowCidrs: parsed.data.CHECKER_ALLOW_CIDRS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}
