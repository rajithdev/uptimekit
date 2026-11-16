import "server-only";
import type { Prisma } from "@uptimekit/database";
import type { CheckListQuery, IncidentListQuery, NotificationSettingsInput } from "@uptimekit/shared";
import { ApiError } from "../../api/errors";
import type { CheckDto, IncidentDetailDto, IncidentDto, NotificationDto, NotificationSettingsDto, Paginated } from "../../api/types";
import { db } from "../db";
import { getOwnedMonitor } from "./monitors";
import { paginate, toCheckDto, toIncidentDto, toNotificationDto } from "./serializers";

const monitorSelect = { select: { id: true, name: true, url: true } } as const;

export async function listIncidents(userId: string, q: IncidentListQuery): Promise<Paginated<IncidentDto>> {
  const where: Prisma.IncidentWhereInput = {
    userId,
    ...(q.monitorId ? { monitorId: q.monitorId } : {}),
    ...(q.status === "open" ? { resolvedAt: null } : q.status === "resolved" ? { resolvedAt: { not: null } } : {}),
  };
  const [total, rows] = await Promise.all([
    db().incident.count({ where }),
    db().incident.findMany({
      where,
      orderBy: [{ startedAt: q.order }, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { monitor: monitorSelect },
    }),
  ]);
  return { data: rows.map(toIncidentDto), pagination: paginate(q.page, q.pageSize, total) };
}

export async function getIncident(userId: string, incidentId: string): Promise<IncidentDetailDto> {
  const incident = await db().incident.findFirst({
    where: { id: incidentId, userId },
    include: {
      monitor: monitorSelect,
      notifications: { orderBy: { createdAt: "asc" }, include: { monitor: { select: { id: true, name: true } } } },
    },
  });
  if (!incident) throw ApiError.notFound("Incident");
  // Checks around the incident: from 5 minutes before it started until it ended (or now).
  const from = new Date(incident.startedAt.getTime() - 5 * 60_000);
  const to = incident.resolvedAt ? new Date(incident.resolvedAt.getTime() + 5 * 60_000) : new Date();
  const checks = await db().check.findMany({
    where: { monitorId: incident.monitorId, checkedAt: { gte: from, lte: to } },
    orderBy: { checkedAt: "desc" },
    take: 200,
  });
  return {
    ...toIncidentDto(incident),
    notifications: incident.notifications.map(toNotificationDto),
    checks: checks.map(toCheckDto),
  };
}

export async function listChecks(userId: string, monitorId: string, q: CheckListQuery): Promise<Paginated<CheckDto>> {
  await getOwnedMonitor(userId, monitorId);
  const where: Prisma.CheckWhereInput = {
    monitorId,
    ...(q.result ? { result: q.result } : {}),
    ...(q.from || q.to ? { checkedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([
    db().check.count({ where }),
    db().check.findMany({ where, orderBy: [{ checkedAt: q.order }, { id: q.order }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { data: rows.map(toCheckDto), pagination: paginate(q.page, q.pageSize, total) };
}

export async function listNotifications(userId: string, page: number, pageSize: number): Promise<Paginated<NotificationDto>> {
  const where = { userId };
  const [total, rows] = await Promise.all([
    db().notification.count({ where }),
    db().notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { monitor: { select: { id: true, name: true } } },
    }),
  ]);
  return { data: rows.map(toNotificationDto), pagination: paginate(page, pageSize, total) };
}

export async function getNotificationSettings(userId: string, accountEmail: string): Promise<NotificationSettingsDto> {
  const s = await db().notificationSettings.findUnique({ where: { userId } });
  return {
    emailEnabled: s?.emailEnabled ?? true,
    notifyOnDown: s?.notifyOnDown ?? true,
    notifyOnRecovery: s?.notifyOnRecovery ?? true,
    alertEmail: s?.alertEmail ?? null,
    accountEmail,
  };
}

export async function updateNotificationSettings(
  userId: string,
  accountEmail: string,
  input: NotificationSettingsInput,
): Promise<NotificationSettingsDto> {
  await db().notificationSettings.upsert({ where: { userId }, update: input, create: { userId, ...input } });
  return getNotificationSettings(userId, accountEmail);
}
