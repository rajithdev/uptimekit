import ipaddr from "ipaddr.js";

/**
 * IP address policy used to prevent server-side request forgery (SSRF).
 *
 * Rather than a string blocklist, every address is parsed and classified by range. Only
 * globally-routable unicast addresses are permitted. Everything else — loopback, RFC 1918
 * private space, link-local (incl. the 169.254.169.254 cloud metadata service), CGNAT,
 * multicast, reserved/documentation space, IPv6 unique-local, and IPv6 transition
 * mechanisms that can embed an internal IPv4 address — is rejected.
 */

type Cidr = [ipaddr.IPv4 | ipaddr.IPv6, number];

/** Extra ranges blocked on top of ipaddr.js's own range() classification. */
const EXTRA_BLOCKED_CIDRS: readonly string[] = [
  "0.0.0.0/8", // "this network"
  "100.64.0.0/10", // carrier-grade NAT (also hosts Alibaba Cloud metadata 100.100.100.200)
  "169.254.0.0/16", // link-local, AWS/GCP/Azure metadata 169.254.169.254
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // TEST-NET-1
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "240.0.0.0/4", // reserved
  "255.255.255.255/32",
  "64:ff9b::/96", // NAT64 (can embed internal IPv4)
  "64:ff9b:1::/48", // local-use NAT64
  "2001:db8::/32", // documentation
  "2002::/16", // 6to4 (can embed internal IPv4)
  "2001::/32", // Teredo
  "fc00::/7", // unique local (incl. AWS IMDS fd00:ec2::254)
  "fe80::/10", // link-local
  "fec0::/10", // deprecated site-local
  "ff00::/8", // multicast
];

const PARSED_EXTRA_BLOCKED: Cidr[] = EXTRA_BLOCKED_CIDRS.map((c) => ipaddr.parseCIDR(c));

export interface IpPolicy {
  /**
   * CIDRs that bypass the SSRF rules. DEVELOPMENT/TEST ONLY — e.g. ["127.0.0.1/32"] so the
   * worker can monitor a local test server. Empty in production.
   */
  allowCidrs?: readonly string[];
}

export type AddressVerdict = { allowed: true } | { allowed: false; reason: string };

export function parseCidrList(list: readonly string[] | undefined): Cidr[] {
  if (!list) return [];
  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return ipaddr.parseCIDR(s);
      } catch {
        throw new Error(`Invalid CIDR in allow list: ${s}`);
      }
    });
}

function matchesAny(addr: ipaddr.IPv4 | ipaddr.IPv6, cidrs: Cidr[]): boolean {
  return cidrs.some(([range, bits]) => addr.kind() === range.kind() && addr.match(range, bits));
}

export function isIpLiteral(host: string): boolean {
  return ipaddr.isValid(stripBrackets(host));
}

export function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Classify a single IP address string against the SSRF policy. */
export function checkAddress(address: string, policy: IpPolicy = {}): AddressVerdict {
  const raw = stripBrackets(address);
  // Strip an IPv6 zone index (fe80::1%eth0) — zone-scoped addresses are link-local anyway.
  const withoutZone = raw.includes("%") ? raw.slice(0, raw.indexOf("%")) : raw;

  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(withoutZone);
  } catch {
    return { allowed: false, reason: `not a valid IP address: ${address}` };
  }

  // Normalise IPv4-mapped IPv6 (::ffff:127.0.0.1) to plain IPv4 before classification.
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }

  const allowList = parseCidrList(policy.allowCidrs);
  if (allowList.length > 0 && matchesAny(parsed, allowList)) {
    return { allowed: true };
  }

  const range = parsed.range();
  if (range !== "unicast") {
    return { allowed: false, reason: `address ${parsed.toString()} is in a non-public range (${range})` };
  }
  if (matchesAny(parsed, PARSED_EXTRA_BLOCKED)) {
    return { allowed: false, reason: `address ${parsed.toString()} is in a blocked range` };
  }
  return { allowed: true };
}
