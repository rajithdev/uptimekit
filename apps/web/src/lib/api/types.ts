// Response shapes of the UptimeKit REST API (shared by route handlers and the UI).

export type MonitorStatus = "PENDING" | "UP" | "DOWN" | "PAUSED" | "UNKNOWN";

export interface MonitorDto {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: string;
  keyword: string | null;
  followRedirects: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  retryIntervalSeconds: number;
  notificationsEnabled: boolean;
  status: MonitorStatus;
  /** True when an active monitor has not completed a check for 3+ intervals. */
  isStale: boolean;
  lastCheckedAt: string | null;
  lastResponseTimeMs: number | null;
  lastStatusCode: number | null;
  lastError: string | null;
  lastStatusChangeAt: string | null;
  nextCheckAt: string;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitorListItemDto extends MonitorDto {
  stats24h: { uptime: number | null; avgResponseTimeMs: number | null; checks: number };
  /** Hourly average response time for the last 24 hours (null = no data). */
  sparkline: (number | null)[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CheckDto {
  id: string;
  checkedAt: string;
  result: "UP" | "DOWN";
  responseTimeMs: number | null;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
}

export interface IncidentDto {
  id: string;
  monitorId: string;
  monitor: { id: string; name: string; url: string };
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  cause: string;
  errorType: string | null;
  statusCode: number | null;
}

export interface NotificationDto {
  id: string;
  type: "INCIDENT_OPENED" | "INCIDENT_RESOLVED";
  channel: string;
  recipient: string;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  incidentId: string;
  monitor: { id: string; name: string };
}

export interface IncidentDetailDto extends IncidentDto {
  notifications: NotificationDto[];
  checks: CheckDto[];
}

export interface SeriesPoint {
  t: string;
  avgResponseTimeMs: number | null;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
  upChecks: number;
  downChecks: number;
  uptime: number | null;
}

export interface MonitorStatsDto {
  range: "24h" | "7d" | "30d";
  windowStart: string;
  windowEnd: string;
  /** Source of the aggregate: raw checks (24h) or hourly rollups (7d/30d). */
  source: "checks" | "rollups";
  uptime: number | null;
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  expectedChecks: number;
  coverage: number | null;
  latency: { avg: number | null; min: number | null; max: number | null; p50: number | null; p95: number | null };
  incidents: { count: number; downtimeSeconds: number };
  bucketSeconds: number;
  series: SeriesPoint[];
  /** Daily uptime for the last 30 days (oldest first). */
  daily: { date: string; uptime: number | null; checks: number }[];
}

export interface DashboardSummaryDto {
  totals: { monitors: number; up: number; down: number; paused: number; pending: number; unknown: number };
  averageUptime24h: number | null;
  averageResponseTimeMs24h: number | null;
  openIncidents: number;
  incidentsLast24h: number;
  recentIncidents: IncidentDto[];
  responseTimeSeries: { t: string; avgResponseTimeMs: number | null }[];
  checksLast24h: number;
}

export interface NotificationSettingsDto {
  emailEnabled: boolean;
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  alertEmail: string | null;
  accountEmail: string;
}
