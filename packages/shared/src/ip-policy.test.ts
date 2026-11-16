import { describe, expect, it } from "vitest";
import { checkAddress } from "./ip-policy";

describe("checkAddress (SSRF IP policy)", () => {
  const blocked = [
    ["127.0.0.1", "IPv4 loopback"],
    ["127.255.255.254", "loopback /8"],
    ["0.0.0.0", "unspecified"],
    ["10.0.0.5", "RFC1918 10/8"],
    ["172.16.0.1", "RFC1918 172.16/12"],
    ["172.31.255.255", "RFC1918 upper edge"],
    ["192.168.1.1", "RFC1918 192.168/16"],
    ["169.254.169.254", "cloud metadata (link-local)"],
    ["169.254.0.1", "link-local"],
    ["100.64.0.1", "CGNAT"],
    ["100.100.100.200", "Alibaba metadata (CGNAT)"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["192.0.2.10", "TEST-NET-1"],
    ["198.18.0.1", "benchmarking"],
    ["240.0.0.1", "reserved"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fe80::1", "IPv6 link-local"],
    ["fe80::1%en0", "IPv6 link-local with zone"],
    ["fc00::1", "IPv6 unique local"],
    ["fd00:ec2::254", "AWS IMDS IPv6"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
    ["64:ff9b::a00:1", "NAT64 embedding 10.0.0.1"],
    ["2002:7f00:1::1", "6to4 embedding 127.0.0.1"],
    ["2001:0:4136:e378::1", "Teredo"],
    ["2001:db8::1", "documentation"],
    ["[::1]", "bracketed IPv6 loopback"],
  ] as const;

  it.each(blocked)("blocks %s (%s)", (addr) => {
    expect(checkAddress(addr).allowed).toBe(false);
  });

  const allowed = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"];
  it.each(allowed)("allows public address %s", (addr) => {
    expect(checkAddress(addr).allowed).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(checkAddress("not-an-ip").allowed).toBe(false);
  });

  it("honours the explicit dev/test allow list", () => {
    expect(checkAddress("127.0.0.1", { allowCidrs: ["127.0.0.1/32"] }).allowed).toBe(true);
    // Allow list is precise — neighbouring addresses remain blocked.
    expect(checkAddress("127.0.0.2", { allowCidrs: ["127.0.0.1/32"] }).allowed).toBe(false);
    expect(checkAddress("10.0.0.1", { allowCidrs: ["127.0.0.1/32"] }).allowed).toBe(false);
  });

  it("throws on an invalid allow-list entry", () => {
    expect(() => checkAddress("1.1.1.1", { allowCidrs: ["nope"] })).toThrow(/Invalid CIDR/);
  });
});
