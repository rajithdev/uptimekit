import { z } from "zod";
import type { IpPolicy } from "./ip-policy";
import { isValidStatusSpec } from "./status-codes";
import { MAX_URL_LENGTH, validateTargetUrl } from "./url-policy";

export const MONITOR_LIMITS = {
  minIntervalSeconds: 30,
  maxIntervalSeconds: 86_400,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 60_000,
  maxThreshold: 10,
  minRetryIntervalSeconds: 5,
  maxRetryIntervalSeconds: 3_600,
  maxKeywordLength: 200,
  maxNameLength: 100,
} as const;

export interface MonitorSchemaOptions {
  /** IP policy applied to literal-IP URLs (dev/test escape hatch only). */
  ipPolicy?: IpPolicy;
  /** Server-configurable minimum interval (default 30s). */
  minIntervalSeconds?: number;
}

const httpMethod = z.enum(["GET", "HEAD"]);

function monitorFields(options: MonitorSchemaOptions) {
  const minInterval = options.minIntervalSeconds ?? MONITOR_LIMITS.minIntervalSeconds;
  return {
    name: z.string().trim().min(1, "Name is required").max(MONITOR_LIMITS.maxNameLength),
    url: z
      .string()
      .trim()
      .min(1, "URL is required")
      .max(MAX_URL_LENGTH)
      .superRefine((value, ctx) => {
        const verdict = validateTargetUrl(value, options.ipPolicy);
        if (!verdict.ok) ctx.addIssue({ code: "custom", message: verdict.reason });
      }),
    method: httpMethod,
    intervalSeconds: z.coerce
      .number()
      .int()
      .min(minInterval, `Interval must be at least ${minInterval} seconds`)
      .max(MONITOR_LIMITS.maxIntervalSeconds),
    timeoutMs: z.coerce.number().int().min(MONITOR_LIMITS.minTimeoutMs).max(MONITOR_LIMITS.maxTimeoutMs),
    expectedStatusCodes: z
      .string()
      .trim()
      .max(200)
      .refine(isValidStatusSpec, "Use codes or ranges like 200-299 or 200,301"),
    keyword: z
      .string()
      .trim()
      .max(MONITOR_LIMITS.maxKeywordLength)
      .nullish()
      .transform((v) => (v ? v : null)),
    followRedirects: z.boolean(),
    failureThreshold: z.coerce.number().int().min(1).max(MONITOR_LIMITS.maxThreshold),
    recoveryThreshold: z.coerce.number().int().min(1).max(MONITOR_LIMITS.maxThreshold),
    retryIntervalSeconds: z.coerce
      .number()
      .int()
      .min(MONITOR_LIMITS.minRetryIntervalSeconds)
      .max(MONITOR_LIMITS.maxRetryIntervalSeconds),
    notificationsEnabled: z.boolean(),
  };
}

export const MONITOR_DEFAULTS = {
  method: "GET" as const,
  intervalSeconds: 60,
  timeoutMs: 10_000,
  expectedStatusCodes: "200-299",
  keyword: null,
  followRedirects: true,
  failureThreshold: 2,
  recoveryThreshold: 2,
  retryIntervalSeconds: 20,
  notificationsEnabled: true,
};

type CrossFieldInput = {
  method?: "GET" | "HEAD";
  keyword?: string | null;
  timeoutMs?: number;
  intervalSeconds?: number;
};

/** Rules that span several fields. Applied to the *merged* monitor on update. */
export function crossFieldIssues(m: CrossFieldInput): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (m.method === "HEAD" && m.keyword) {
    issues.push({ path: "keyword", message: "Keyword matching requires GET (HEAD responses have no body)" });
  }
  if (m.timeoutMs !== undefined && m.intervalSeconds !== undefined && m.timeoutMs >= m.intervalSeconds * 1000) {
    issues.push({ path: "timeoutMs", message: "Timeout must be shorter than the check interval" });
  }
  return issues;
}

export function buildMonitorCreateSchema(options: MonitorSchemaOptions = {}) {
  const f = monitorFields(options);
  return z
    .object({
      name: f.name,
      url: f.url,
      method: f.method.default(MONITOR_DEFAULTS.method),
      intervalSeconds: f.intervalSeconds.default(MONITOR_DEFAULTS.intervalSeconds),
      timeoutMs: f.timeoutMs.default(MONITOR_DEFAULTS.timeoutMs),
      expectedStatusCodes: f.expectedStatusCodes.default(MONITOR_DEFAULTS.expectedStatusCodes),
      keyword: f.keyword,
      followRedirects: f.followRedirects.default(MONITOR_DEFAULTS.followRedirects),
      failureThreshold: f.failureThreshold.default(MONITOR_DEFAULTS.failureThreshold),
      recoveryThreshold: f.recoveryThreshold.default(MONITOR_DEFAULTS.recoveryThreshold),
      retryIntervalSeconds: f.retryIntervalSeconds.default(MONITOR_DEFAULTS.retryIntervalSeconds),
      notificationsEnabled: f.notificationsEnabled.default(MONITOR_DEFAULTS.notificationsEnabled),
    })
    .strict()
    .superRefine((m, ctx) => {
      for (const issue of crossFieldIssues(m)) {
        ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
      }
    });
}

export function buildMonitorUpdateSchema(options: MonitorSchemaOptions = {}) {
  const f = monitorFields(options);
  return z
    .object({
      name: f.name,
      url: f.url,
      method: f.method,
      intervalSeconds: f.intervalSeconds,
      timeoutMs: f.timeoutMs,
      expectedStatusCodes: f.expectedStatusCodes,
      keyword: f.keyword,
      followRedirects: f.followRedirects,
      failureThreshold: f.failureThreshold,
      recoveryThreshold: f.recoveryThreshold,
      retryIntervalSeconds: f.retryIntervalSeconds,
      notificationsEnabled: f.notificationsEnabled,
    })
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
}

export type MonitorCreateInput = z.infer<ReturnType<typeof buildMonitorCreateSchema>>;
export type MonitorUpdateInput = z.infer<ReturnType<typeof buildMonitorUpdateSchema>>;

// ───────────────────────── Query schemas ─────────────────────────

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const order = z.enum(["asc", "desc"]).default("desc");

export const monitorStatusSchema = z.enum(["PENDING", "UP", "DOWN", "PAUSED", "UNKNOWN"]);

export const monitorListQuerySchema = z.object({
  page,
  pageSize,
  sort: z.enum(["name", "createdAt", "status", "lastCheckedAt", "lastResponseTimeMs"]).default("createdAt"),
  order,
  status: monitorStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type MonitorListQuery = z.infer<typeof monitorListQuerySchema>;

export const incidentListQuerySchema = z.object({
  page,
  pageSize,
  status: z.enum(["open", "resolved", "all"]).default("all"),
  monitorId: z.string().trim().min(1).max(64).optional(),
  order,
});
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;

export const checkListQuerySchema = z.object({
  page,
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  result: z.enum(["UP", "DOWN"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  order,
});
export type CheckListQuery = z.infer<typeof checkListQuerySchema>;

export const statsQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("24h"),
});

export const notificationSettingsSchema = z
  .object({
    emailEnabled: z.boolean(),
    notifyOnDown: z.boolean(),
    notifyOnRecovery: z.boolean(),
    alertEmail: z
      .union([z.email().max(254), z.literal(""), z.null()])
      .transform((v) => (v ? v.toLowerCase() : null)),
  })
  .partial()
  .strict();
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const accountUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();
