import { describe, expect, it } from "vitest";
import { validateTargetUrl } from "./url-policy";

describe("validateTargetUrl", () => {
  it.each(["https://example.com", "http://example.com:8080/health?x=1", "https://api.github.com/zen", "https://1.1.1.1/"])(
    "accepts %s",
    (url) => {
      expect(validateTargetUrl(url).ok).toBe(true);
    },
  );

  const rejected: [string, RegExp][] = [
    ["ftp://example.com", /Only http/],
    ["file:///etc/passwd", /Only http/],
    ["gopher://example.com:70/", /Only http/],
    ["javascript:alert(1)", /Only http/],
    ["data:text/plain,hello", /Only http/],
    ["http://user:pass@example.com", /credentials/],
    ["http://localhost:3000", /internal hostname/],
    ["http://LOCALHOST", /internal hostname/],
    ["http://app.localhost", /internal hostname/],
    ["http://printer.local", /internal hostname/],
    ["http://metadata.google.internal/computeMetadata/v1/", /internal hostname/],
    ["http://redis:6379", /fully-qualified/],
    ["http://127.0.0.1", /not allowed/],
    ["http://127.1", /not allowed/], // WHATWG normalises to 127.0.0.1
    ["http://2130706433", /not allowed/], // decimal 127.0.0.1
    ["http://0x7f000001", /not allowed/], // hex 127.0.0.1
    ["http://0177.0.0.1", /not allowed/], // octal 127.0.0.1
    ["http://169.254.169.254/latest/meta-data/", /not allowed/],
    ["http://[::1]:8080", /not allowed/],
    ["http://[::ffff:127.0.0.1]", /not allowed/],
    ["http://[fd00:ec2::254]", /not allowed/],
    ["http://10.0.0.1", /not allowed/],
    ["http://0.0.0.0", /not allowed/],
    ["not a url", /Invalid URL/],
    [`https://example.com/${"a".repeat(2100)}`, /at most/],
  ];

  it.each(rejected)("rejects %s", (url, reason) => {
    const v = validateTargetUrl(url);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(reason);
  });

  it("allows an explicitly allow-listed literal IP (dev/test only)", () => {
    expect(validateTargetUrl("http://127.0.0.1:4000", { allowCidrs: ["127.0.0.1/32"] }).ok).toBe(true);
  });

  it("does not relax hostname rules when an allow list is set", () => {
    expect(validateTargetUrl("http://localhost:4000", { allowCidrs: ["127.0.0.1/32"] }).ok).toBe(false);
  });
});
