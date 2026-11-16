import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoHealthBadge } from "@/components/demo/health-badge";
import { DemoShell } from "@/components/demo/demo-shell";
import { buildDemoDataset } from "@/lib/demo/fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/demo" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

const NOW = new Date("2026-11-17T12:00:00Z");
const data = buildDemoDataset(NOW);

describe("demo dataset", () => {
  it("is deterministic for the same moment", () => {
    expect(buildDemoDataset(NOW)).toEqual(data);
  });

  it("covers operational, degraded, down and paused examples", () => {
    expect(new Set(data.monitors.map((m) => m.health))).toEqual(new Set(["operational", "degraded", "down", "paused"]));
    expect(data.monitors.find((m) => m.health === "down")?.status).toBe("DOWN");
    expect(data.monitors.find((m) => m.health === "degraded")?.status).toBe("UP");
    expect(data.monitors.find((m) => m.health === "paused")?.status).toBe("PAUSED");
  });

  it("uses only reserved example domains (no real services)", () => {
    for (const m of data.monitors) {
      expect(new URL(m.url).hostname).toMatch(/(^|\.)example\.(com|net|org)$/);
    }
  });

  it("derives uptime from check counts and never reports 100% without data", () => {
    for (const m of data.monitors) {
      for (const range of ["24h", "7d", "30d"] as const) {
        const s = data.stats[m.id]![range];
        expect(s.totalChecks).toBe(s.upChecks + s.downChecks);
        if (s.totalChecks === 0) expect(s.uptime).toBeNull();
        else expect(s.uptime).toBeCloseTo((s.upChecks / s.totalChecks) * 100, 2);
        expect(s.daily).toHaveLength(30);
      }
    }
  });

  it("keeps incidents consistent with monitor state", () => {
    const down = data.monitors.find((m) => m.health === "down")!;
    const open = data.incidents.filter((i) => i.resolvedAt === null);
    expect(open.map((i) => i.monitorId)).toEqual([down.id]);
    expect(data.summary.openIncidents).toBe(1);
    for (const i of data.incidents.filter((x) => x.resolvedAt)) {
      expect(i.durationSeconds).toBe((new Date(i.resolvedAt!).getTime() - new Date(i.startedAt).getTime()) / 1000);
    }
    // The down monitor's recent checks are failing; the operational one's are passing.
    expect(data.checks[down.id]![0]!.result).toBe("DOWN");
    expect(data.checks["demo-auth"]![0]!.result).toBe("UP");
  });

  it("records no checks for a monitor while it is paused", () => {
    const paused = data.monitors.find((m) => m.health === "paused")!;
    expect(data.stats[paused.id]!["24h"].totalChecks).toBe(0);
    expect(data.stats[paused.id]!["24h"].uptime).toBeNull();
    expect(new Date(data.checks[paused.id]![0]!.checkedAt).getTime()).toBeLessThanOrEqual(new Date(paused.pausedAt!).getTime());
  });

  it("summarises the same monitors the dashboard lists", () => {
    expect(data.summary.totals).toMatchObject({ monitors: 6, down: 1, paused: 1, up: 4 });
    expect(data.summary.responseTimeSeries).toHaveLength(24);
  });
});

describe("demo UI", () => {
  it("always labels the data as sample data", () => {
    render(
      <DemoShell>
        <p>content</p>
      </DemoShell>,
    );
    expect(screen.getByRole("note", { name: "Sample data notice" })).toHaveTextContent(/Sample data.*not live monitoring/);
  });

  it("shows a degraded badge with text, not colour alone", () => {
    render(<DemoHealthBadge health="degraded" status="UP" />);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });
});
