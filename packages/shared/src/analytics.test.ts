import { describe, expect, it } from "vitest";
import {
  coverageRatio,
  downtimeSeconds,
  durationSecondsBetween,
  expectedCheckCount,
  mergeRollups,
  percentile,
  startOfHourUtc,
  summarizeLatency,
  uptimePercentage,
} from "./analytics";

const t = (iso: string) => new Date(iso);

describe("uptimePercentage", () => {
  it("returns null (no data) instead of 100% when nothing was recorded", () => {
    expect(uptimePercentage(0, 0)).toBeNull();
  });
  it("computes the ratio of successful checks", () => {
    expect(uptimePercentage(99, 1)).toBe(99);
    expect(uptimePercentage(1, 0)).toBe(100);
    expect(uptimePercentage(0, 5)).toBe(0);
    expect(uptimePercentage(2, 1)).toBe(66.667);
  });
});

describe("expectedCheckCount / coverageRatio", () => {
  const start = t("2026-01-01T00:00:00Z");
  const end = t("2026-01-02T00:00:00Z");
  it("counts expected checks across the window", () => {
    expect(expectedCheckCount(start, end, 60, t("2025-12-01T00:00:00Z"))).toBe(1440);
  });
  it("only counts time after the monitor was created", () => {
    expect(expectedCheckCount(start, end, 60, t("2026-01-01T12:00:00Z"))).toBe(720);
  });
  it("excludes time after the monitor was paused", () => {
    expect(expectedCheckCount(start, end, 60, t("2025-12-01T00:00:00Z"), t("2026-01-01T06:00:00Z"))).toBe(360);
  });
  it("is zero for a monitor created after the window", () => {
    expect(expectedCheckCount(start, end, 60, t("2026-02-01T00:00:00Z"))).toBe(0);
  });
  it("reports missing data as reduced coverage, never as uptime", () => {
    expect(coverageRatio(720, 1440)).toBe(0.5);
    expect(coverageRatio(2000, 1440)).toBe(1); // retries can exceed the nominal count
    expect(coverageRatio(0, 0)).toBeNull();
  });
});

describe("latency aggregation", () => {
  it("summarises samples", () => {
    const s = summarizeLatency([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(s).toEqual({ count: 10, avg: 550, min: 100, max: 1000, p50: 500, p95: 1000 });
  });
  it("handles empty input", () => {
    expect(summarizeLatency([])).toEqual({ count: 0, avg: null, min: null, max: null, p50: null, p95: null });
  });
  it("ignores invalid samples", () => {
    expect(summarizeLatency([Number.NaN, -1, 50]).count).toBe(1);
  });
  it("uses nearest-rank percentiles", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 75)).toBe(3);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
  it("merges hourly rollups with a weighted average", () => {
    const merged = mergeRollups([
      { totalChecks: 60, upChecks: 60, downChecks: 0, responseTimeSumMs: 6000n, responseTimeCount: 60, minResponseTimeMs: 50, maxResponseTimeMs: 200 },
      { totalChecks: 60, upChecks: 58, downChecks: 2, responseTimeSumMs: 18000, responseTimeCount: 58, minResponseTimeMs: 40, maxResponseTimeMs: 900 },
      { totalChecks: 3, upChecks: 0, downChecks: 3, responseTimeSumMs: 0, responseTimeCount: 0, minResponseTimeMs: null, maxResponseTimeMs: null },
    ]);
    expect(merged).toEqual({
      totalChecks: 123,
      upChecks: 118,
      downChecks: 5,
      avgResponseTimeMs: Math.round(24000 / 118),
      minResponseTimeMs: 40,
      maxResponseTimeMs: 900,
    });
  });
});

describe("downtimeSeconds", () => {
  const ws = t("2026-01-01T00:00:00Z");
  const we = t("2026-01-02T00:00:00Z");
  it("sums resolved incidents inside the window", () => {
    expect(
      downtimeSeconds(
        [
          { startedAt: t("2026-01-01T01:00:00Z"), resolvedAt: t("2026-01-01T01:10:00Z") },
          { startedAt: t("2026-01-01T05:00:00Z"), resolvedAt: t("2026-01-01T05:00:30Z") },
        ],
        ws,
        we,
      ),
    ).toBe(630);
  });
  it("clips incidents that straddle the window edges", () => {
    expect(
      downtimeSeconds([{ startedAt: t("2025-12-31T23:00:00Z"), resolvedAt: t("2026-01-01T00:30:00Z") }], ws, we),
    ).toBe(1800);
  });
  it("runs open incidents up to now", () => {
    expect(downtimeSeconds([{ startedAt: t("2026-01-01T23:00:00Z"), resolvedAt: null }], ws, we, t("2026-01-01T23:15:00Z"))).toBe(900);
  });
  it("never double counts overlapping records", () => {
    expect(
      downtimeSeconds(
        [
          { startedAt: t("2026-01-01T01:00:00Z"), resolvedAt: t("2026-01-01T02:00:00Z") },
          { startedAt: t("2026-01-01T01:30:00Z"), resolvedAt: t("2026-01-01T02:30:00Z") },
        ],
        ws,
        we,
      ),
    ).toBe(5400);
  });
});

describe("time helpers", () => {
  it("computes non-negative durations", () => {
    expect(durationSecondsBetween(t("2026-01-01T00:00:00Z"), t("2026-01-01T00:01:30Z"))).toBe(90);
    expect(durationSecondsBetween(t("2026-01-01T00:01:00Z"), t("2026-01-01T00:00:00Z"))).toBe(0);
  });
  it("truncates to the UTC hour", () => {
    expect(startOfHourUtc(t("2026-01-01T13:47:12.345Z")).toISOString()).toBe("2026-01-01T13:00:00.000Z");
  });
});
