import { lookup } from "dns/promises";
import { BlockList, isIP } from "net";

import { ImportTargetNotAllowed } from "src/types/error.types";

// Loopback, private, link-local (cloud metadata), shared and reserved ranges.
const reservedRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  reservedRanges.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  reservedRanges.addSubnet(network, prefix, "ipv6");
}

/** Whether an IP address is internal or reserved (IPv4-mapped IPv6 included) */
export function isInternalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return reservedRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

function hostOf(entry: string): string | undefined {
  try {
    return new URL(entry.includes("://") ? entry : `https://${entry}`).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Refuse a url that is not http(s) or whose host resolves to an internal
 * address, unless the host is one of the given integration hosts.
 * @throws {ImportTargetNotAllowed}
 */
export async function assertPublicUrl(
  url: string,
  allowedHosts: string[] = [],
): Promise<URL> {
  let target: URL;
  try {
    target = new URL(url);
  } catch (err) {
    throw new ImportTargetNotAllowed(err);
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new ImportTargetNotAllowed();
  }

  const allowed = allowedHosts.map(hostOf).filter(Boolean);
  if (allowed.includes(target.hostname)) return target;

  // URL keeps the brackets around an IPv6 literal
  const host = target.hostname.replace(/^\[(.*)\]$/, "$1");
  let addresses: string[];
  if (isIP(host) !== 0) {
    addresses = [host];
  } else {
    try {
      const resolved = await lookup(host, { all: true, verbatim: true });
      addresses = resolved.map((entry) => entry.address);
    } catch (err) {
      throw new ImportTargetNotAllowed(err);
    }
  }
  if (addresses.length === 0 || addresses.some(isInternalAddress)) {
    throw new ImportTargetNotAllowed();
  }
  return target;
}
