import dns from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import { checkAddress, type IpPolicy } from "../ip-policy";

export class BlockedAddressError extends Error {
  readonly code = "ERR_UPTIMEKIT_BLOCKED_ADDRESS";
  constructor(message: string) {
    super(message);
    this.name = "BlockedAddressError";
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export type DnsResolver = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolver: DnsResolver = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/**
 * A drop-in replacement for `dns.lookup` handed to `net`/`tls` via the `lookup` socket option.
 *
 * Because Node calls this *as part of opening the socket* and connects to exactly the address
 * we return, the address that is validated is the address that is connected to. This closes
 * the DNS-rebinding window that exists when you validate a hostname first and let the HTTP
 * client resolve it again later.
 *
 * If ANY resolved address is non-public the whole lookup fails — an attacker cannot mix a
 * public and a private record and hope the client picks the private one.
 */
export function createSafeLookup(policy: IpPolicy, resolver: DnsResolver = defaultResolver) {
  return function safeLookup(hostname: string, options: LookupOptions | number, callback: LookupCallback): void {
    const opts: LookupOptions = typeof options === "number" ? { family: options } : (options ?? {});
    resolver(hostname)
      .then((records) => {
        const filtered =
          opts.family === 4 || opts.family === 6 ? records.filter((r) => r.family === opts.family) : records;
        if (filtered.length === 0) {
          const err: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
          err.code = "ENOTFOUND";
          callback(err, "", 0);
          return;
        }
        for (const record of filtered) {
          const verdict = checkAddress(record.address, policy);
          if (!verdict.allowed) {
            callback(new BlockedAddressError(`${hostname} resolves to a blocked address: ${verdict.reason}`), "", 0);
            return;
          }
        }
        if (opts.all) {
          callback(null, filtered);
        } else {
          const first = filtered[0]!;
          callback(null, first.address, first.family);
        }
      })
      .catch((err: NodeJS.ErrnoException) => callback(err, "", 0));
  };
}
