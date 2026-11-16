import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { ResendEmailProvider } from "../src/notifications/provider";
import { createEmailProvider } from "../src/runtime";
import { testLogger } from "./helpers";

/**
 * A deterministic local stand-in for the Resend HTTPS API (POST /emails), so the provider's
 * request format, auth and error handling are tested without network access or real keys.
 */
const KEY = "re_test_not_a_real_key_0123456789";
let server: http.Server;
let base: string;
let mode: "ok" | "validation" | "rate_limited" = "ok";
let received: { auth: string | undefined; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ auth: req.headers.authorization, body: JSON.parse(raw || "{}") });
      if (req.url !== "/emails" || req.method !== "POST") return res.writeHead(404).end();
      if (mode === "validation") {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ statusCode: 403, name: "validation_error", message: "You can only send testing emails to your own email address." }));
      } else if (mode === "rate_limited") {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" }));
      } else {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "email_123" }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  mode = "ok";
  received = [];
});

const message = { to: "oncall@example.com", subject: "[DOWN] API is not responding", text: "plain", html: "<p>html</p>" };

describe("ResendEmailProvider", () => {
  it("posts the message with bearer auth and returns the Resend id", async () => {
    const p = new ResendEmailProvider("UptimeKit <alerts@example.com>", KEY, base);
    await expect(p.send(message)).resolves.toEqual({ messageId: "email_123" });
    expect(received).toHaveLength(1);
    expect(received[0]!.auth).toBe(`Bearer ${KEY}`);
    expect(received[0]!.body).toEqual({
      from: "UptimeKit <alerts@example.com>",
      to: ["oncall@example.com"],
      subject: message.subject,
      text: "plain",
      html: "<p>html</p>",
    });
  });

  it("throws on API errors (so the queue retries) without leaking the key", async () => {
    const p = new ResendEmailProvider("UptimeKit <alerts@example.com>", KEY, base);
    mode = "validation";
    const err = await p.send(message).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Resend API 403: validation_error: You can only send testing emails to your own email address.");
    expect((err as Error).message).not.toContain(KEY);
    mode = "rate_limited";
    await expect(p.send(message)).rejects.toThrow(/429/);
  });

  it("fails fast on network errors", async () => {
    const p = new ResendEmailProvider("x@example.com", KEY, "http://127.0.0.1:1", 2000);
    await expect(p.send(message)).rejects.toThrow();
  });

  it("refuses to start without a key", () => {
    expect(() => new ResendEmailProvider("x@example.com", "")).toThrow(/RESEND_API_KEY/);
    expect(() => loadConfig({ DATABASE_URL: "postgres://x", EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY is required/);
  });

  it("is selected by EMAIL_PROVIDER=resend", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://x", EMAIL_PROVIDER: "resend", RESEND_API_KEY: KEY, RESEND_API_URL: base });
    expect(createEmailProvider(config, testLogger).name).toBe("resend");
  });
});
