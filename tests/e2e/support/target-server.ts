// Deterministic HTTP endpoint the monitors under test point at. Its behaviour is switched by
// the tests through a control route, so outages and recoveries are fully reproducible.
import http from "node:http";

const port = Number(process.env.E2E_TARGET_PORT ?? 4010);
let mode: "up" | "down" = "up";

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url?.startsWith("/__mode/")) {
      mode = req.url.endsWith("/down") ? "down" : "up";
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ mode }));
      return;
    }
    if (req.url === "/__ping") {
      res.writeHead(200).end("pong");
      return;
    }
    if (mode === "up") res.writeHead(200, { "content-type": "text/plain" }).end("e2e target: healthy");
    else res.writeHead(503, { "content-type": "text/plain" }).end("e2e target: unavailable");
  })
  .listen(port, "127.0.0.1", () => console.log(`e2e target listening on ${port}`));
