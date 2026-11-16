import { checkAddress, isIpLiteral, stripBrackets, type IpPolicy } from "./ip-policy";

export const MAX_URL_LENGTH = 2048;

/** Hostnames (or suffixes) that must never be monitored regardless of DNS. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal", ".home.arpa", ".lan", ".intranet", ".corp"];

export type UrlVerdict = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Static (DNS-free) validation of a URL a user wants to monitor. This is the first line of
 * defence and runs both in the API and in the worker before every request (including each
 * redirect hop). The worker additionally validates every resolved address at connect time.
 */
export function validateTargetUrl(input: string, policy: IpPolicy = {}): UrlVerdict {
  if (input.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `URL must be at most ${MAX_URL_LENGTH} characters` };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http:// and https:// URLs are supported" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with embedded credentials are not allowed" };
  }
  if (url.port === "0") {
    return { ok: false, reason: "Port 0 is not allowed" };
  }

  // WHATWG URL parsing already normalises exotic IPv4 forms (http://2130706433, http://0x7f.1)
  // into dotted-quad, so the IP checks below see the canonical address.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) {
    return { ok: false, reason: "URL must include a hostname" };
  }

  if (isIpLiteral(host)) {
    const verdict = checkAddress(stripBrackets(host), policy);
    if (!verdict.allowed) {
      return { ok: false, reason: `Target not allowed: ${verdict.reason}` };
    }
    return { ok: true, url };
  }

  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Target not allowed: internal hostname" };
  }
  // Single-label names ("redis", "postgres") resolve via search domains / container DNS
  // to internal services. Public sites always have a dot.
  if (!host.includes(".")) {
    return { ok: false, reason: "Target not allowed: hostname must be a fully-qualified domain" };
  }

  return { ok: true, url };
}
