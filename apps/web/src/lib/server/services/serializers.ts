import "server-only";
import type { Check, Incident, Monitor, Notification } from "@uptimekit/database";
import type { CheckDto, IncidentDto, MonitorDto, NotificationDto } from "../../api/types";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function isMonitorStale(m: Pick<Monitor, "status" | "lastCheckedAt" | "createdAt" | "intervalSeconds">, now = Date.now()): boolean {
  if (m.status === "PAUSED") return false;
  const reference = (m.lastCheckedAt ?? m.createdAt).getTime();
  return now - reference > Math.max(m.intervalSeconds * 3, 300) * 1000;
}

export function toMonitorDto(m: Monitor): MonitorDto {
  return {
    id: m.id,
    name: m.name,
    url: m.url,
    method: m.method,
    intervalSeconds: m.intervalSeconds,
    timeoutMs: m.timeoutMs,
    expectedStatusCodes: m.expectedStatusCodes,
    keyword: m.keyword,
    followRedirects: m.followRedirects,
    failureThreshold: m.failureThreshold,
    recoveryThreshold: m.recoveryThreshold,
    retryIntervalSeconds: m.retryIntervalSeconds,
    notificationsEnabled: m.notificationsEnabled,
    status: m.status,
    isStale: isMonitorStale(m),
    lastCheckedAt: iso(m.lastCheckedAt),
    lastResponseTimeMs: m.lastResponseTimeMs,
    lastStatusCode: m.lastStatusCode,
    lastError: m.lastError,
    lastStatusChangeAt: iso(m.lastStatusChangeAt),
    nextCheckAt: m.nextCheckAt.toISOString(),
    pausedAt: iso(m.pausedAt),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function toCheckDto(c: Check): CheckDto {
  return {
    id: c.id.toString(),
    checkedAt: c.checkedAt.toISOString(),
    result: c.result,
    responseTimeMs: c.responseTimeMs,
    statusCode: c.statusCode,
    errorType: c.errorType,
    errorMessage: c.errorMessage,
  };
}

export function toIncidentDto(i: Incident & { monitor: Pick<Monitor, "id" | "name" | "url"> }): IncidentDto {
  return {
    id: i.id,
    monitorId: i.monitorId,
    monitor: { id: i.monitor.id, name: i.monitor.name, url: i.monitor.url },
    startedAt: i.startedAt.toISOString(),
    resolvedAt: iso(i.resolvedAt),
    durationSeconds: i.durationSeconds,
    cause: i.cause,
    errorType: i.errorType,
    statusCode: i.statusCode,
  };
}

export function toNotificationDto(n: Notification & { monitor: Pick<Monitor, "id" | "name"> }): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    channel: n.channel,
    recipient: n.recipient,
    status: n.status,
    attempts: n.attempts,
    lastError: n.lastError,
    sentAt: iso(n.sentAt),
    createdAt: n.createdAt.toISOString(),
    incidentId: n.incidentId,
    monitor: { id: n.monitor.id, name: n.monitor.name },
  };
}

export function paginate(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
