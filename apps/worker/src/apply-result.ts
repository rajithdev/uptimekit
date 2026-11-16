import { Prisma, type PrismaClient } from "@uptimekit/database";
import {
  applyCheckOutcome,
  decideIncidentAction,
  durationSecondsBetween,
  nextCheckDelaySeconds,
  startOfHourUtc,
  type MonitorStatus,
  type Transition,
} from "@uptimekit/shared";
import type { HttpCheckResult } from "@uptimekit/shared/server";

/** The subset of an HTTP check result that is persisted. */
export type CheckRecord = Pick<HttpCheckResult, "result" | "responseTimeMs" | "statusCode" | "errorType" | "errorMessage">;

export type ApplyOutcome =
  | { applied: false; reason: "monitor_deleted" | "monitor_paused" }
  | {
      applied: true;
      /** False when the check finished after a newer check was already applied. */
      evaluated: boolean;
      status: MonitorStatus;
      transition: Transition;
      incident: { action: "OPENED" | "RESOLVED"; id: string } | null;
      /** Notification rows created in this transaction that still need delivery. */
      pendingNotificationIds: string[];
    };

interface LockedMonitor {
  id: string;
  user_id: string;
  name: string;
  status: MonitorStatus;
  consecutive_failures: number;
  consecutive_successes: number;
  failure_threshold: number;
  recovery_threshold: number;
  interval_seconds: number;
  retry_interval_seconds: number;
  notifications_enabled: boolean;
  last_checked_at: Date | null;
  last_status_change_at: Date | null;
}

/**
 * Persist a check result and advance the monitor's state, atomically.
 *
 * Concurrency model: the monitor row is locked with `SELECT … FOR UPDATE` for the duration
 * of the transaction, so results for the same monitor are applied strictly one at a time no
 * matter how many worker processes are running. The partial unique index
 * `incidents_one_open_per_monitor` and the unique `(incident_id, type, channel)` constraint on
 * notifications are a second, database-enforced line of defence against duplicates.
 */
export async function applyCheckResult(
  prisma: PrismaClient,
  monitorId: string,
  check: CheckRecord,
  checkedAt: Date,
): Promise<ApplyOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedMonitor[]>`
        SELECT id, user_id, name, status, consecutive_failures, consecutive_successes,
               failure_threshold, recovery_threshold, interval_seconds, retry_interval_seconds,
               notifications_enabled, last_checked_at, last_status_change_at
        FROM monitors WHERE id = ${monitorId} FOR UPDATE`;
      const monitor = rows[0];
      if (!monitor) return { applied: false, reason: "monitor_deleted" } as const;
      // Results that race with a pause are discarded: paused means "no data", not "up".
      if (monitor.status === "PAUSED") return { applied: false, reason: "monitor_paused" } as const;

      await tx.check.create({
        data: {
          monitorId,
          checkedAt,
          result: check.result,
          responseTimeMs: check.responseTimeMs,
          statusCode: check.statusCode,
          errorType: check.errorType,
          errorMessage: check.errorMessage,
        },
      });
      await upsertHourlyRollup(tx, monitorId, checkedAt, check);

      // A check that started before the last applied one is recorded for history but must not
      // drive state (e.g. a slow request finishing after a newer, faster one).
      if (monitor.last_checked_at && checkedAt < monitor.last_checked_at) {
        return {
          applied: true,
          evaluated: false,
          status: monitor.status,
          transition: "NONE",
          incident: null,
          pendingNotificationIds: [],
        } as const;
      }

      const { state, transition } = applyCheckOutcome(
        {
          status: monitor.status,
          consecutiveFailures: monitor.consecutive_failures,
          consecutiveSuccesses: monitor.consecutive_successes,
        },
        check.result,
        { failureThreshold: monitor.failure_threshold, recoveryThreshold: monitor.recovery_threshold },
      );

      const openIncident = await tx.incident.findFirst({
        where: { monitorId, resolvedAt: null },
        select: { id: true, startedAt: true },
      });
      const action = decideIncidentAction(state.status, openIncident !== null);

      let incident: { action: "OPENED" | "RESOLVED"; id: string } | null = null;
      const pendingNotificationIds: string[] = [];

      if (action === "OPEN") {
        // The outage started at the first failed check of the current failure streak.
        const startedAt = (await streakStart(tx, monitorId, "DOWN", monitor.last_status_change_at)) ?? checkedAt;
        const created = await tx.incident.create({
          data: {
            monitorId,
            userId: monitor.user_id,
            startedAt,
            cause: check.errorMessage ?? "Check failed",
            errorType: check.errorType,
            statusCode: check.statusCode,
          },
          select: { id: true },
        });
        incident = { action: "OPENED", id: created.id };
        const n = await createNotification(tx, monitor, created.id, "INCIDENT_OPENED");
        if (n) pendingNotificationIds.push(n);
      } else if (action === "RESOLVE" && openIncident) {
        // Service came back at the first success of the current success streak.
        const recoveredAt = (await streakStart(tx, monitorId, "UP", monitor.last_status_change_at)) ?? checkedAt;
        const resolvedAt = recoveredAt < openIncident.startedAt ? checkedAt : recoveredAt;
        await tx.incident.update({
          where: { id: openIncident.id },
          data: { resolvedAt, durationSeconds: durationSecondsBetween(openIncident.startedAt, resolvedAt) },
        });
        incident = { action: "RESOLVED", id: openIncident.id };
        const n = await createNotification(tx, monitor, openIncident.id, "INCIDENT_RESOLVED");
        if (n) pendingNotificationIds.push(n);
      }

      const delay = nextCheckDelaySeconds(state, {
        intervalSeconds: monitor.interval_seconds,
        retryIntervalSeconds: monitor.retry_interval_seconds,
      });
      await tx.monitor.update({
        where: { id: monitorId },
        data: {
          status: state.status,
          consecutiveFailures: state.consecutiveFailures,
          consecutiveSuccesses: state.consecutiveSuccesses,
          lastCheckedAt: checkedAt,
          lastResponseTimeMs: check.responseTimeMs,
          lastStatusCode: check.statusCode,
          lastError: check.result === "DOWN" ? check.errorMessage : null,
          nextCheckAt: new Date(checkedAt.getTime() + delay * 1000),
          ...(state.status !== monitor.status ? { lastStatusChangeAt: checkedAt } : {}),
        },
      });

      return {
        applied: true,
        evaluated: true,
        status: state.status,
        transition,
        incident,
        pendingNotificationIds,
      } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
  );
}

type Tx = Prisma.TransactionClient;

async function upsertHourlyRollup(tx: Tx, monitorId: string, checkedAt: Date, check: CheckRecord): Promise<void> {
  const hour = startOfHourUtc(checkedAt);
  const up = check.result === "UP" ? 1 : 0;
  const rt = check.responseTimeMs;
  await tx.$executeRaw`
    INSERT INTO check_rollups_hourly AS r
      (monitor_id, hour, total_checks, up_checks, down_checks,
       response_time_sum_ms, response_time_count, min_response_time_ms, max_response_time_ms)
    VALUES (${monitorId}, ${hour}, 1, ${up}, ${1 - up},
            ${rt ?? 0}, ${rt === null ? 0 : 1}, ${rt}, ${rt})
    ON CONFLICT (monitor_id, hour) DO UPDATE SET
      total_checks = r.total_checks + 1,
      up_checks = r.up_checks + EXCLUDED.up_checks,
      down_checks = r.down_checks + EXCLUDED.down_checks,
      response_time_sum_ms = r.response_time_sum_ms + EXCLUDED.response_time_sum_ms,
      response_time_count = r.response_time_count + EXCLUDED.response_time_count,
      min_response_time_ms = LEAST(r.min_response_time_ms, EXCLUDED.min_response_time_ms),
      max_response_time_ms = GREATEST(r.max_response_time_ms, EXCLUDED.max_response_time_ms)`;
}

/**
 * Timestamp of the first check in the trailing streak of `result` checks, never earlier than the
 * monitor's last status change (e.g. a resume or URL edit resets history that must not count).
 */
async function streakStart(tx: Tx, monitorId: string, result: "UP" | "DOWN", notBefore: Date | null): Promise<Date | null> {
  const opposite = result === "UP" ? "DOWN" : "UP";
  const rows = await tx.$queryRaw<{ started: Date | null }[]>`
    SELECT MIN(checked_at) AS started FROM checks
    WHERE monitor_id = ${monitorId}
      AND result = ${result}::"CheckResult"
      AND checked_at >= COALESCE(${notBefore}::timestamptz, '-infinity'::timestamptz)
      AND checked_at > COALESCE(
        (SELECT MAX(checked_at) FROM checks WHERE monitor_id = ${monitorId} AND result = ${opposite}::"CheckResult"),
        '-infinity'::timestamptz)`;
  return rows[0]?.started ?? null;
}

/**
 * Insert the outbox row for an alert. Preferences are evaluated now and persisted with the
 * row (SKIPPED rows are kept for the audit trail). Returns the id if delivery is needed.
 */
async function createNotification(
  tx: Tx,
  monitor: LockedMonitor,
  incidentId: string,
  type: "INCIDENT_OPENED" | "INCIDENT_RESOLVED",
): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: monitor.user_id },
    select: { email: true, notificationSettings: true },
  });
  if (!user) return null;
  const s = user.notificationSettings;
  const prefs = {
    emailEnabled: s?.emailEnabled ?? true,
    notifyOnDown: s?.notifyOnDown ?? true,
    notifyOnRecovery: s?.notifyOnRecovery ?? true,
  };
  let skipReason: string | null = null;
  if (!monitor.notifications_enabled) skipReason = "Notifications disabled for this monitor";
  else if (!prefs.emailEnabled) skipReason = "Email notifications disabled in settings";
  else if (type === "INCIDENT_OPENED" && !prefs.notifyOnDown) skipReason = "Downtime alerts disabled in settings";
  else if (type === "INCIDENT_RESOLVED" && !prefs.notifyOnRecovery) skipReason = "Recovery alerts disabled in settings";

  const row = await tx.notification.upsert({
    where: { incidentId_type_channel: { incidentId, type, channel: "email" } },
    // Never overwrite an existing row: a replay must not reset delivery state.
    update: {},
    create: {
      userId: monitor.user_id,
      monitorId: monitor.id,
      incidentId,
      type,
      channel: "email",
      recipient: s?.alertEmail ?? user.email,
      status: skipReason ? "SKIPPED" : "PENDING",
      lastError: skipReason,
    },
    select: { id: true, status: true },
  });
  return row.status === "PENDING" ? row.id : null;
}
