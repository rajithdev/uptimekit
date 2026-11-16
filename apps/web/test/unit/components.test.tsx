import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/app/status";
import { Sparkline } from "@/components/charts/sparkline";
import { UptimeBars } from "@/components/charts/uptime-bars";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("StatusBadge", () => {
  it.each([
    ["UP", "Operational"],
    ["DOWN", "Down"],
    ["PAUSED", "Paused"],
    ["PENDING", "Pending"],
    ["UNKNOWN", "Unknown"],
  ] as const)("labels %s as %s (status is never colour-only)", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
  it("marks stale data", () => {
    render(<StatusBadge status="UP" stale />);
    expect(screen.getByText(/stale/)).toBeInTheDocument();
  });
});

describe("UptimeBars", () => {
  it("renders one bar per day and labels days without data as 'No data'", () => {
    render(
      <TooltipProvider>
        <UptimeBars
          days={[
            { date: "2026-01-01", uptime: null, checks: 0 },
            { date: "2026-01-02", uptime: 100, checks: 1440 },
            { date: "2026-01-03", uptime: 90, checks: 1440 },
          ]}
        />
      </TooltipProvider>,
    );
    const bars = screen.getAllByRole("listitem");
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveAccessibleName(/No data/);
    expect(bars[1]).toHaveAccessibleName(/Healthy 100%/);
    expect(bars[2]).toHaveAccessibleName(/Outage 90\.00%/);
  });
});

describe("Sparkline", () => {
  it("does not draw a line from insufficient data", () => {
    render(<Sparkline values={[null, null, 120]} />);
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
  });
  it("breaks the line at gaps instead of interpolating", () => {
    const { container } = render(<Sparkline values={[100, 120, null, 90, 95]} />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });
});
