import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorForm } from "@/components/monitors/monitor-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MonitorForm />
    </QueryClientProvider>,
  );
}

describe("MonitorForm", () => {
  beforeEach(() => push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("shows server-side validation errors next to the offending field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: [{ path: "url", message: "Target not allowed: internal hostname" }] },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Name"), "Internal");
    const url = screen.getByLabelText("URL");
    await user.clear(url);
    await user.type(url, "http://localhost:8080");
    await user.click(screen.getByRole("button", { name: /create monitor/i }));

    expect(await screen.findByText("Target not allowed: internal hostname")).toBeInTheDocument();
    expect(url).toHaveAttribute("aria-invalid", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("submits a typed payload and navigates to the new monitor", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "m_123", name: "API" } }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Name"), "API");
    const url = screen.getByLabelText("URL");
    await user.clear(url);
    await user.type(url, "https://api.example.com/health");
    await user.click(screen.getByRole("button", { name: "5m" }));
    await user.click(screen.getByRole("button", { name: /create monitor/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/monitors/m_123"));
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/v1/monitors");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "API",
      url: "https://api.example.com/health",
      method: "GET",
      intervalSeconds: 300,
      timeoutMs: 10000,
      keyword: null,
      failureThreshold: 2,
    });
  });
});
