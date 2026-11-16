import { describe, expect, it } from "vitest";
import {
  applyCheckOutcome,
  decideIncidentAction,
  nextCheckDelaySeconds,
  type CheckOutcome,
  type MonitorRuntimeState,
} from "./state-machine";

const rules = { failureThreshold: 3, recoveryThreshold: 2 };
const fresh: MonitorRuntimeState = { status: "PENDING", consecutiveFailures: 0, consecutiveSuccesses: 0 };

function run(start: MonitorRuntimeState, outcomes: CheckOutcome[], r = rules) {
  let state = start;
  const transitions: string[] = [];
  for (const o of outcomes) {
    const res = applyCheckOutcome(state, o, r);
    state = res.state;
    transitions.push(res.transition);
  }
  return { state, transitions };
}

describe("applyCheckOutcome", () => {
  it("PENDING becomes UP on the first success", () => {
    const { state, transitions } = run(fresh, ["UP"]);
    expect(state.status).toBe("UP");
    expect(transitions).toEqual(["BECAME_UP"]);
  });

  it("a single transient failure does not mark the monitor DOWN", () => {
    const { state, transitions } = run({ ...fresh, status: "UP" }, ["DOWN", "UP"]);
    expect(state.status).toBe("UP");
    expect(transitions).toEqual(["NONE", "NONE"]);
    expect(state.consecutiveFailures).toBe(0);
  });

  it("requires failureThreshold consecutive failures to go DOWN", () => {
    const { state, transitions } = run({ ...fresh, status: "UP" }, ["DOWN", "DOWN", "DOWN"]);
    expect(transitions).toEqual(["NONE", "NONE", "WENT_DOWN"]);
    expect(state).toEqual({ status: "DOWN", consecutiveFailures: 3, consecutiveSuccesses: 0 });
  });

  it("interrupted failure streaks reset the counter", () => {
    const { state } = run({ ...fresh, status: "UP" }, ["DOWN", "DOWN", "UP", "DOWN", "DOWN"]);
    expect(state.status).toBe("UP");
    expect(state.consecutiveFailures).toBe(2);
  });

  it("a new monitor that never succeeds goes DOWN after the threshold", () => {
    const { state, transitions } = run(fresh, ["DOWN", "DOWN", "DOWN"]);
    expect(state.status).toBe("DOWN");
    expect(transitions.at(-1)).toBe("WENT_DOWN");
  });

  it("stays DOWN on further failures without re-transitioning", () => {
    const down: MonitorRuntimeState = { status: "DOWN", consecutiveFailures: 3, consecutiveSuccesses: 0 };
    const { transitions } = run(down, ["DOWN", "DOWN"]);
    expect(transitions).toEqual(["NONE", "NONE"]);
  });

  it("requires recoveryThreshold consecutive successes to recover", () => {
    const down: MonitorRuntimeState = { status: "DOWN", consecutiveFailures: 3, consecutiveSuccesses: 0 };
    const { state, transitions } = run(down, ["UP", "UP"]);
    expect(transitions).toEqual(["NONE", "RECOVERED"]);
    expect(state.status).toBe("UP");
  });

  it("a flapping success during an outage does not recover", () => {
    const down: MonitorRuntimeState = { status: "DOWN", consecutiveFailures: 3, consecutiveSuccesses: 0 };
    const { state } = run(down, ["UP", "DOWN", "UP"]);
    expect(state.status).toBe("DOWN");
    expect(state.consecutiveSuccesses).toBe(1);
  });

  it("threshold of 1 transitions immediately", () => {
    const r = { failureThreshold: 1, recoveryThreshold: 1 };
    expect(run({ ...fresh, status: "UP" }, ["DOWN"], r).state.status).toBe("DOWN");
    expect(run({ status: "DOWN", consecutiveFailures: 1, consecutiveSuccesses: 0 }, ["UP"], r).state.status).toBe("UP");
  });

  it("UNKNOWN behaves like PENDING", () => {
    expect(applyCheckOutcome({ ...fresh, status: "UNKNOWN" }, "UP", rules).transition).toBe("BECAME_UP");
  });

  it("never evaluates paused monitors", () => {
    const paused: MonitorRuntimeState = { status: "PAUSED", consecutiveFailures: 0, consecutiveSuccesses: 0 };
    expect(applyCheckOutcome(paused, "DOWN", { failureThreshold: 1, recoveryThreshold: 1 })).toEqual({
      state: paused,
      transition: "NONE",
    });
  });
});

describe("nextCheckDelaySeconds (retry rules)", () => {
  const sched = { intervalSeconds: 60, retryIntervalSeconds: 20 };
  it("uses the normal interval when healthy", () => {
    expect(nextCheckDelaySeconds({ status: "UP", consecutiveFailures: 0, consecutiveSuccesses: 5 }, sched)).toBe(60);
  });
  it("retries faster while a failure is unconfirmed", () => {
    expect(nextCheckDelaySeconds({ status: "UP", consecutiveFailures: 1, consecutiveSuccesses: 0 }, sched)).toBe(20);
  });
  it("uses the normal interval once DOWN is confirmed", () => {
    expect(nextCheckDelaySeconds({ status: "DOWN", consecutiveFailures: 4, consecutiveSuccesses: 0 }, sched)).toBe(60);
  });
  it("retries faster while recovery is unconfirmed", () => {
    expect(nextCheckDelaySeconds({ status: "DOWN", consecutiveFailures: 0, consecutiveSuccesses: 1 }, sched)).toBe(20);
  });
  it("never exceeds the interval", () => {
    expect(
      nextCheckDelaySeconds(
        { status: "UP", consecutiveFailures: 1, consecutiveSuccesses: 0 },
        { intervalSeconds: 10, retryIntervalSeconds: 30 },
      ),
    ).toBe(10);
  });
});

describe("decideIncidentAction (incident lifecycle)", () => {
  it("opens an incident when DOWN without an open incident", () => {
    expect(decideIncidentAction("DOWN", false)).toBe("OPEN");
  });
  it("is idempotent when DOWN with an open incident", () => {
    expect(decideIncidentAction("DOWN", true)).toBe("NONE");
  });
  it("resolves when UP with an open incident", () => {
    expect(decideIncidentAction("UP", true)).toBe("RESOLVE");
  });
  it("does nothing when UP and healthy", () => {
    expect(decideIncidentAction("UP", false)).toBe("NONE");
  });
  it("does nothing for PENDING/UNKNOWN/PAUSED", () => {
    for (const s of ["PENDING", "UNKNOWN", "PAUSED"] as const) {
      expect(decideIncidentAction(s, true)).toBe("NONE");
      expect(decideIncidentAction(s, false)).toBe("NONE");
    }
  });
});
