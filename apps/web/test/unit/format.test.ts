import { describe, expect, it } from "vitest";
import { formatDuration, formatInterval, formatMs, formatPercent, hostOf, relativeTime } from "@/lib/format";

describe("formatters", () => {
  it("formats latency", () => {
    expect(formatMs(null)).toBe("—");
    expect(formatMs(87.4)).toBe("87 ms");
    expect(formatMs(12_345)).toBe("12.3 s");
  });
  it("formats uptime and never shows missing data as a percentage", () => {
    expect(formatPercent(null)).toBe("No data");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(99.9876, 2)).toBe("99.99%");
  });
  it("formats durations", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3 * 3600 + 120)).toBe("3h 2m");
    expect(formatDuration(2 * 86400 + 3600)).toBe("2d 1h");
  });
  it("formats relative time", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(relativeTime(null)).toBe("never");
    expect(relativeTime("2026-01-01T11:59:58Z", now)).toBe("just now");
    expect(relativeTime("2026-01-01T11:55:00Z", now)).toBe("5 minutes ago");
    expect(relativeTime("2026-01-01T09:00:00Z", now)).toBe("3 hours ago");
  });
  it("formats intervals and hosts", () => {
    expect(formatInterval(30)).toBe("30s");
    expect(formatInterval(300)).toBe("5m");
    expect(formatInterval(7200)).toBe("2h");
    expect(hostOf("https://api.example.com:8443/health")).toBe("api.example.com:8443");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
