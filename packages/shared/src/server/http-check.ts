import type dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import zlib from "node:zlib";
import type { IpPolicy } from "../ip-policy";
import { isExpectedStatus } from "../status-codes";
import { validateTargetUrl } from "../url-policy";
import { BlockedAddressError, createSafeLookup, type DnsResolver } from "./safe-lookup";

export const USER_AGENT = "UptimeKit/1.0 (+https://github.com/rajithdev/uptimekit)";
export const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB of (decoded) body is inspected for keywords
export const MAX_REDIRECTS = 5;

export type CheckErrorType =
  | "TIMEOUT"
  | "DNS"
  | "CONNECTION"
  | "TLS"
  | "STATUS"
  | "KEYWORD"
  | "BLOCKED"
  | "REDIRECT"
  | "INVALID_URL"
  | "ERROR";

export interface HttpCheckConfig {
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusCodes: string;
  keyword: string | null;
  followRedirects: boolean;
}

export interface HttpCheckOptions {
  policy?: IpPolicy;
  /** Injectable DNS resolver (tests). */
  resolver?: DnsResolver;
  /** Extra CA certificates (tests with self-signed servers). */
  ca?: string | Buffer;
  maxBodyBytes?: number;
}

export interface HttpCheckResult {
  result: "UP" | "DOWN";
  /** Time to response headers (incl. DNS, TCP, TLS) summed across redirect hops. */
  responseTimeMs: number | null;
  statusCode: number | null;
  errorType: CheckErrorType | null;
  errorMessage: string | null;
  finalUrl: string;
  redirects: number;
  bodyTruncated: boolean;
}

interface HopResponse {
  statusCode: number;
  location: string | null;
  body: string | null;
  bodyTruncated: boolean;
  headersMs: number;
}

class CheckError extends Error {
  constructor(
    readonly type: CheckErrorType,
    message: string,
  ) {
    super(message);
  }
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Perform one HTTP(S) availability check with SSRF protections:
 * scheme/host validation on every hop, connect-time IP validation (DNS-rebinding safe),
 * manual redirect handling, a hard overall deadline and a capped response body.
 */
export async function performHttpCheck(config: HttpCheckConfig, options: HttpCheckOptions = {}): Promise<HttpCheckResult> {
  const policy = options.policy ?? {};
  const deadline = Date.now() + config.timeoutMs;
  const lookup = createSafeLookup(policy, options.resolver);
  const maxBody = options.maxBodyBytes ?? MAX_BODY_BYTES;

  let currentUrl = config.url;
  let method = config.method;
  let redirects = 0;
  let elapsed = 0;

  const fail = (type: CheckErrorType, message: string, statusCode: number | null = null): HttpCheckResult => ({
    result: "DOWN",
    responseTimeMs: statusCode !== null ? Math.round(elapsed) : null,
    statusCode,
    errorType: type,
    errorMessage: truncate(message, 500),
    finalUrl: currentUrl,
    redirects,
    bodyTruncated: false,
  });

  for (;;) {
    const verdict = validateTargetUrl(currentUrl, policy);
    if (!verdict.ok) {
      return fail(redirects > 0 ? "BLOCKED" : "INVALID_URL", verdict.reason);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return fail("TIMEOUT", `Timed out after ${config.timeoutMs}ms`);

    const needBody = method === "GET" && config.keyword !== null;
    let hop: HopResponse;
    try {
      hop = await requestOnce(verdict.url, method, remaining, lookup, needBody, maxBody, options.ca);
    } catch (err) {
      const classified = classifyError(err, config.timeoutMs);
      return fail(classified.type, classified.message);
    }
    elapsed += hop.headersMs;

    if (REDIRECT_CODES.has(hop.statusCode) && config.followRedirects && hop.location) {
      if (redirects >= MAX_REDIRECTS) {
        return fail("REDIRECT", `Too many redirects (>${MAX_REDIRECTS})`, hop.statusCode);
      }
      let next: URL;
      try {
        next = new URL(hop.location, verdict.url);
      } catch {
        return fail("REDIRECT", "Redirect with invalid Location header", hop.statusCode);
      }
      redirects += 1;
      currentUrl = next.toString();
      if (hop.statusCode === 303 && method !== "HEAD") method = "GET";
      continue;
    }

    const responseTimeMs = Math.round(elapsed);
    if (!isExpectedStatus(hop.statusCode, config.expectedStatusCodes)) {
      return {
        ...fail("STATUS", `Unexpected HTTP status ${hop.statusCode} (expected ${config.expectedStatusCodes})`, hop.statusCode),
        responseTimeMs,
      };
    }
    if (needBody && config.keyword !== null && !(hop.body ?? "").includes(config.keyword)) {
      return {
        ...fail("KEYWORD", `Keyword "${truncate(config.keyword, 50)}" not found in response body`, hop.statusCode),
        responseTimeMs,
        bodyTruncated: hop.bodyTruncated,
      };
    }
    return {
      result: "UP",
      responseTimeMs,
      statusCode: hop.statusCode,
      errorType: null,
      errorMessage: null,
      finalUrl: currentUrl,
      redirects,
      bodyTruncated: hop.bodyTruncated,
    };
  }
}

function requestOnce(
  url: URL,
  method: "GET" | "HEAD",
  timeoutMs: number,
  lookup: ReturnType<typeof createSafeLookup>,
  needBody: boolean,
  maxBody: number,
  ca: string | Buffer | undefined,
): Promise<HopResponse> {
  return new Promise<HopResponse>((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const started = performance.now();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = transport.request(
      url,
      {
        method,
        // A fresh connection per check: no keep-alive pool means every request goes through
        // our validating lookup, and latency numbers include connection setup.
        agent: false,
        lookup: lookup as unknown as typeof dns.lookup,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
          "Accept-Encoding": needBody ? "gzip, deflate, br" : "identity",
          Connection: "close",
        },
        ...(isHttps && ca ? { ca } : {}),
        maxHeaderSize: 32 * 1024,
      },
      (res) => {
        const headersMs = performance.now() - started;
        const statusCode = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;

        if (!needBody || REDIRECT_CODES.has(statusCode)) {
          res.destroy();
          finish(() => resolve({ statusCode, location, body: null, bodyTruncated: false, headersMs }));
          return;
        }

        // Decode compressed bodies with an output cap (protects against decompression bombs).
        // Decoded bytes are counted below and both streams are destroyed at the cap.
        let stream: NodeJS.ReadableStream & { destroy?: () => void } = res;
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const done = () => {
          const body = Buffer.concat(chunks).subarray(0, maxBody).toString("utf8");
          finish(() => resolve({ statusCode, location, body, bodyTruncated: truncated, headersMs }));
        };
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          chunks.push(chunk);
          if (size >= maxBody) {
            truncated = true;
            res.destroy();
            if (stream !== res) stream.destroy?.();
            done();
          }
        });
        stream.on("end", done);
        stream.on("error", (err) => finish(() => reject(err)));
        res.on("error", (err) => finish(() => reject(err)));
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new CheckError("TIMEOUT", `Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on("error", (err) => finish(() => reject(err)));
    req.end();
  });
}

function classifyError(err: unknown, timeoutMs: number): { type: CheckErrorType; message: string } {
  if (err instanceof CheckError) return { type: err.type, message: err.message };
  if (err instanceof BlockedAddressError) return { type: "BLOCKED", message: err.message };
  const e = err as NodeJS.ErrnoException;
  const code = e?.code ?? "";
  const message = e?.message ?? String(err);
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return { type: "TIMEOUT", message: `Timed out after ${timeoutMs}ms` };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return { type: "DNS", message: `DNS lookup failed (${code})` };
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ECONNABORTED"].includes(code)) {
    return { type: "CONNECTION", message: `Connection failed (${code})` };
  }
  if (
    code.startsWith("ERR_TLS") ||
    code.startsWith("ERR_SSL") ||
    code.startsWith("CERT_") ||
    code.includes("CERT") ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
    code === "ERR_UPTIMEKIT_TLS"
  ) {
    return { type: "TLS", message: `TLS error: ${message}` };
  }
  if (code === "HPE_HEADER_OVERFLOW") return { type: "ERROR", message: "Response headers too large" };
  return { type: "ERROR", message };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
