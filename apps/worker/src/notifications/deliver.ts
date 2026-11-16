import type { PrismaClient } from "@uptimekit/database";
import type { Logger } from "../logger";
import type { EmailProvider } from "./provider";
import { renderAlertEmail } from "./templates";

export interface DeliveryDeps {
  prisma: PrismaClient;
  provider: EmailProvider;
  logger: Logger;
  appUrl: string;
}

export type DeliveryResult = "sent" | "already_handled" | "missing";

/**
 * Deliver one notification. Throws on provider failure so BullMQ retries with backoff.
 * `isFinalAttempt` lets us persist FAILED once retries are exhausted.
 *
 * Delivery is at-least-once: if the process dies after the provider accepted the message but
 * before the SENT status is committed, the message may be sent again on retry.
 */
export async function deliverNotification(
  deps: DeliveryDeps,
  notificationId: string,
  isFinalAttempt: boolean,
): Promise<DeliveryResult> {
  const n = await deps.prisma.notification.findUnique({
    where: { id: notificationId },
    include: { incident: true, monitor: { select: { id: true, name: true, url: true } } },
  });
  if (!n) return "missing";
  if (n.status !== "PENDING") return "already_handled";

  const message = renderAlertEmail(
    {
      type: n.type,
      monitorName: n.monitor.name,
      monitorUrl: n.monitor.url,
      monitorId: n.monitor.id,
      incidentId: n.incidentId,
      cause: n.incident.cause,
      startedAt: n.incident.startedAt,
      resolvedAt: n.incident.resolvedAt,
      durationSeconds: n.incident.durationSeconds,
      appUrl: deps.appUrl,
    },
    n.recipient,
  );

  try {
    await deps.provider.send(message);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await deps.prisma.notification.update({
      where: { id: n.id },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 500),
        ...(isFinalAttempt ? { status: "FAILED" } : {}),
      },
    });
    deps.logger.warn({ notificationId: n.id, attempt: n.attempts + 1, final: isFinalAttempt, error }, "notification delivery failed");
    throw err;
  }

  await deps.prisma.notification.update({
    where: { id: n.id },
    data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
  });
  deps.logger.info({ notificationId: n.id, type: n.type, provider: deps.provider.name }, "notification sent");
  return "sent";
}
