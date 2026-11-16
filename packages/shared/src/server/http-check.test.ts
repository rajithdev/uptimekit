import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { performHttpCheck, type HttpCheckConfig } from "./http-check";
import type { DnsResolver } from "./safe-lookup";

/**
 * These tests run the real checker against a deterministic local HTTP server. Because the
 * server listens on 127.0.0.1, tests that expect success explicitly allow-list 127.0.0.1/32 —
 * the same dev/test escape hatch the worker exposes via CHECKER_ALLOW_CIDRS.
 */

let server: http.Server;
let base: string;
let port: number;
const seenMethods: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    seenMethods.push(req.method ?? "");
    switch (url.pathname) {
      case "/ok":
        res.writeHead(200, { "content-type": "text/plain" }).end("all systems operational");
        return;
      case "/fail":
        res.writeHead(500).end("boom");
        return;
      case "/not-found":
        res.writeHead(404).end("missing");
        return;
      case "/slow":
        setTimeout(() => res.writeHead(200).end("late"), 2000);
        return;
      case "/gzip":
        res.writeHead(200, { "content-encoding": "gzip" }).end(zlib.gzipSync("compressed healthy payload"));
        return;
      case "/big": {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("x".repeat(2 * 1024 * 1024));
        res.end("NEEDLE");
        return;
      }
      case "/redirect":
        res.writeHead(302, { location: "/ok" }).end();
        return;
      case "/loop":
        res.writeHead(302, { location: "/loop" }).end();
        return;
      case "/redirect-metadata":
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        return;
      case "/redirect-localhost":
        res.writeHead(301, { location: "http://localhost/admin" }).end();
        return;
      case "/redirect-file":
        res.writeHead(301, { location: "file:///etc/passwd" }).end();
        return;
      default:
        res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const allowLocal = { policy: { allowCidrs: ["127.0.0.1/32"] } };

function cfg(path: string, overrides: Partial<HttpCheckConfig> = {}): HttpCheckConfig {
  return {
    url: `${base}${path}`,
    method: "GET",
    timeoutMs: 1000,
    expectedStatusCodes: "200-299",
    keyword: null,
    followRedirects: true,
    ...overrides,
  };
}

describe("performHttpCheck — availability", () => {
  it("reports UP with latency for a healthy endpoint", async () => {
    const r = await performHttpCheck(cfg("/ok"), allowLocal);
    expect(r.result).toBe("UP");
    expect(r.statusCode).toBe(200);
    expect(r.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(r.errorType).toBeNull();
  });

  it("reports DOWN on an unexpected status", async () => {
    const r = await performHttpCheck(cfg("/fail"), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", statusCode: 500, errorType: "STATUS" });
    expect(r.responseTimeMs).not.toBeNull();
  });

  it("honours custom expected status codes", async () => {
    const r = await performHttpCheck(cfg("/not-found", { expectedStatusCodes: "404" }), allowLocal);
    expect(r.result).toBe("UP");
  });

  it("times out slow endpoints within the configured deadline", async () => {
    const started = Date.now();
    const r = await performHttpCheck(cfg("/slow", { timeoutMs: 300 }), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("uses HEAD when configured", async () => {
    seenMethods.length = 0;
    const r = await performHttpCheck(cfg("/ok", { method: "HEAD" }), allowLocal);
    expect(r.result).toBe("UP");
    expect(seenMethods).toEqual(["HEAD"]);
  });

  it("classifies connection refused", async () => {
    const tmp = http.createServer();
    await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
    const closedPort = (tmp.address() as AddressInfo).port;
    await new Promise<void>((r) => tmp.close(() => r()));
    const r = await performHttpCheck(cfg("/ok", { url: `http://127.0.0.1:${closedPort}/` }), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "CONNECTION" });
  });

  it("classifies DNS failures", async () => {
    const resolver: DnsResolver = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    };
    const r = await performHttpCheck(cfg("/", { url: "http://does-not-exist.example.com/" }), { resolver });
    expect(r).toMatchObject({ result: "DOWN", errorType: "DNS" });
  });
});

describe("performHttpCheck — keyword matching & body limits", () => {
  it("finds a keyword in the body", async () => {
    const r = await performHttpCheck(cfg("/ok", { keyword: "operational" }), allowLocal);
    expect(r.result).toBe("UP");
  });

  it("fails when the keyword is missing", async () => {
    const r = await performHttpCheck(cfg("/ok", { keyword: "degraded" }), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "KEYWORD", statusCode: 200 });
  });

  it("decodes gzip bodies", async () => {
    const r = await performHttpCheck(cfg("/gzip", { keyword: "healthy" }), allowLocal);
    expect(r.result).toBe("UP");
  });

  it("caps body size and does not read past the limit", async () => {
    const r = await performHttpCheck(cfg("/big", { keyword: "NEEDLE", timeoutMs: 5000 }), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "KEYWORD", bodyTruncated: true });
  });
});

describe("performHttpCheck — redirects", () => {
  it("follows safe redirects", async () => {
    const r = await performHttpCheck(cfg("/redirect"), allowLocal);
    expect(r).toMatchObject({ result: "UP", redirects: 1 });
    expect(r.finalUrl).toBe(`${base}/ok`);
  });

  it("does not follow redirects when disabled", async () => {
    const r = await performHttpCheck(cfg("/redirect", { followRedirects: false }), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", statusCode: 302, errorType: "STATUS" });
  });

  it("stops redirect loops", async () => {
    const r = await performHttpCheck(cfg("/loop"), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "REDIRECT" });
  });
});

describe("performHttpCheck — SSRF protection", () => {
  it("blocks loopback targets without an allow list", async () => {
    const r = await performHttpCheck(cfg("/ok"));
    expect(r).toMatchObject({ result: "DOWN", errorType: "INVALID_URL" });
  });

  it("re-validates redirect targets (cloud metadata)", async () => {
    const r = await performHttpCheck(cfg("/redirect-metadata"), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
    expect(r.errorMessage).toMatch(/non-public|blocked/);
  });

  it("re-validates redirect targets (localhost hostname)", async () => {
    const r = await performHttpCheck(cfg("/redirect-localhost"), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
  });

  it("refuses redirects to non-HTTP schemes", async () => {
    const r = await performHttpCheck(cfg("/redirect-file"), allowLocal);
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
  });

  it("blocks public-looking hostnames that resolve to private addresses", async () => {
    const resolver: DnsResolver = async () => [{ address: "10.1.2.3", family: 4 }];
    const r = await performHttpCheck(cfg("/", { url: "http://innocent.example.com/" }), { resolver });
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
  });

  it("blocks hostnames resolving to cloud metadata over IPv6-mapped IPv4", async () => {
    const resolver: DnsResolver = async () => [{ address: "::ffff:169.254.169.254", family: 6 }];
    const r = await performHttpCheck(cfg("/", { url: "http://sneaky.example.com/" }), { resolver });
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
  });

  it("blocks mixed public/private DNS answers", async () => {
    const resolver: DnsResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    const r = await performHttpCheck(cfg("/", { url: "http://mixed.example.com/" }), { resolver });
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
  });

  it("validates the address actually used for the connection (DNS rebinding)", async () => {
    // A rebinding resolver: whatever was returned before, at connect time it answers with
    // the private address. Because validation happens inside the socket's lookup, the
    // connection is refused — there is no second, unvalidated resolution.
    let calls = 0;
    const resolver: DnsResolver = async () => {
      calls += 1;
      return [{ address: "127.0.0.1", family: 4 }];
    };
    const r = await performHttpCheck(cfg("/", { url: `http://rebind.example.com:${port}/ok` }), { resolver });
    expect(r).toMatchObject({ result: "DOWN", errorType: "BLOCKED" });
    expect(calls).toBe(1);
  });

  it("connects to the pinned, validated address when allowed", async () => {
    const resolver: DnsResolver = async () => [{ address: "127.0.0.1", family: 4 }];
    const r = await performHttpCheck(cfg("/", { url: `http://pinned.example.com:${port}/ok` }), { ...allowLocal, resolver });
    expect(r.result).toBe("UP");
  });
});
