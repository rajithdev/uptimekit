/**
 * Pure monitor status state machine.
 *
 * A single failed check never marks a monitor DOWN on its own: the monitor must fail
 * `failureThreshold` consecutive checks. Likewise a DOWN monitor needs `recoveryThreshold`
 * consecutive successes before it is considered recovered. While a transition is being
 * confirmed the next check is scheduled sooner (`retryIntervalSeconds`).
 *
 * Incidents are NOT derived from transitions here; the worker opens/closes incidents based
 * on the resulting status and whether an open incident exists, which keeps it idempotent.
 */

export type MonitorStatus = "PENDING" | "UP" | "DOWN" | "PAUSED" | "UNKNOWN";
export type CheckOutcome = "UP" | "DOWN";

export interface MonitorRuntimeState {
  status: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface ConfirmationRules {
  failureThreshold: number;
  recoveryThreshold: number;
}

export type Transition =
  | "NONE"
  /** PENDING/UNKNOWN → UP (first successful check; no outage to recover from). */
  | "BECAME_UP"
  /** Any non-DOWN state → DOWN after the failure threshold is reached. */
  | "WENT_DOWN"
  /** DOWN → UP after the recovery threshold is reached. */
  | "RECOVERED";

export interface TransitionResult {
  state: MonitorRuntimeState;
  transition: Transition;
}

export function applyCheckOutcome(
  current: MonitorRuntimeState,
  outcome: CheckOutcome,
  rules: ConfirmationRules,
): TransitionResult {
  if (current.status === "PAUSED") {
    // Paused monitors must not be evaluated; callers drop results for paused monitors.
    return { state: current, transition: "NONE" };
  }
  const failureThreshold = Math.max(1, rules.failureThreshold);
  const recoveryThreshold = Math.max(1, rules.recoveryThreshold);

  if (outcome === "UP") {
    const consecutiveSuccesses = current.consecutiveSuccesses + 1;
    const base = { consecutiveFailures: 0, consecutiveSuccesses };
    switch (current.status) {
      case "UP":
        return { state: { status: "UP", ...base }, transition: "NONE" };
      case "PENDING":
      case "UNKNOWN":
        return { state: { status: "UP", ...base }, transition: "BECAME_UP" };
      case "DOWN":
        return consecutiveSuccesses >= recoveryThreshold
          ? { state: { status: "UP", ...base }, transition: "RECOVERED" }
          : { state: { status: "DOWN", ...base }, transition: "NONE" };
    }
  }

  const consecutiveFailures = current.consecutiveFailures + 1;
  const base = { consecutiveFailures, consecutiveSuccesses: 0 };
  if (current.status === "DOWN") {
    return { state: { status: "DOWN", ...base }, transition: "NONE" };
  }
  if (consecutiveFailures >= failureThreshold) {
    return { state: { status: "DOWN", ...base }, transition: "WENT_DOWN" };
  }
  return { state: { status: current.status, ...base }, transition: "NONE" };
}

export interface ScheduleRules {
  intervalSeconds: number;
  retryIntervalSeconds: number;
}

/**
 * Seconds until the next check. Uses the faster retry interval while a status change is
 * pending confirmation (unconfirmed failure, or partial recovery from DOWN).
 */
export function nextCheckDelaySeconds(state: MonitorRuntimeState, rules: ScheduleRules): number {
  const confirmingFailure = state.status !== "DOWN" && state.consecutiveFailures > 0;
  const confirmingRecovery = state.status === "DOWN" && state.consecutiveSuccesses > 0;
  if (confirmingFailure || confirmingRecovery) {
    return Math.min(rules.retryIntervalSeconds, rules.intervalSeconds);
  }
  return rules.intervalSeconds;
}

export type IncidentAction = "OPEN" | "RESOLVE" | "NONE";

/**
 * Decide what to do with incidents given the post-check status and whether an incident is
 * currently open. Idempotent: replaying the same check can never open a second incident.
 */
export function decideIncidentAction(status: MonitorStatus, hasOpenIncident: boolean): IncidentAction {
  if (status === "DOWN" && !hasOpenIncident) return "OPEN";
  if (status === "UP" && hasOpenIncident) return "RESOLVE";
  return "NONE";
}
