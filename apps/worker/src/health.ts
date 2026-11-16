import http from "node:http";

export interface HealthState {
  ready: boolean;
  lastSchedulerTickAt: number | null;
  checks: () => Promise<Record<string, boolean>>;
}

/** Minimal liveness/readiness endpoint for container orchestrators. */
export function startHealthServer(port: number, state: HealthState): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url !== "/healthz" && req.url !== "/readyz") {
      res.writeHead(404).end();
      return;
    }
    let deps: Record<string, boolean> = {};
    try {
      deps = await state.checks();
    } catch {
      deps = { error: false };
    }
    const schedulerFresh = state.lastSchedulerTickAt !== null && Date.now() - state.lastSchedulerTickAt < 60_000;
    const ok = state.ready && schedulerFresh && Object.values(deps).every(Boolean);
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: ok ? "ok" : "unhealthy",
        ready: state.ready,
        lastSchedulerTickAt: state.lastSchedulerTickAt ? new Date(state.lastSchedulerTickAt).toISOString() : null,
        dependencies: deps,
      }),
    );
  });
  server.listen(port, "0.0.0.0");
  return server;
}
