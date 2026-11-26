import { lookup } from "dns/promises";
import { type IncomingMessage, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { BlockList, isIP, type LookupFunction } from "net";

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
function isInternalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return reservedRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** A refusal because the host name did not resolve */
export class HostLookupFailed extends ImportTargetNotAllowed {}

/** Lowercase host name without IPv6 brackets */
function bareHost(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

/** Host name of a url or bare host entry */
function hostOf(entry: string): string | undefined {
  try {
    const url = new URL(entry.includes("://") ? entry : `https://${entry}`);
    return bareHost(url.hostname);
  } catch {
    return undefined;
  }
}

/**
 * GitLab hosts the operator allows on internal addresses and plain http,
 * from the comma-separated GITLAB_ALLOWED_PRIVATE_HOSTS setting.
 */
export function gitlabAllowedPrivateHosts(): string[] {
  return (process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

interface OutboundPolicy {
  /** Hosts allowed to resolve to internal addresses (and to use plain http) */
  allowedPrivateHosts?: string[];
  /** Refuse plain http unless the host is allowed */
  httpsOnly?: boolean;
}

interface VettedAddress {
  address: string;
  family: number;
}

interface VettedUrl {
  url: URL;
  /** Lowercase host name without IPv6 brackets */
  host: string;
  /** The only addresses a connection to this url may use */
  addresses: VettedAddress[];
}

/**
 * Parse and resolve a url once, refusing non-http(s) urls and hosts with an
 * internal address unless the host is allowed.
 * @throws {ImportTargetNotAllowed}
 */
export async function resolveOutboundUrl(
  url: string | URL,
  policy: OutboundPolicy = {},
): Promise<VettedUrl> {
  let target: URL;
  try {
    target = new URL(url);
  } catch (err) {
    throw new ImportTargetNotAllowed(err);
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new ImportTargetNotAllowed();
  }

  const host = bareHost(target.hostname);
  const isAllowed = (policy.allowedPrivateHosts ?? [])
    .map(hostOf)
    .includes(host);
  if (policy.httpsOnly && target.protocol !== "https:" && !isAllowed) {
    throw new ImportTargetNotAllowed();
  }

  let addresses: VettedAddress[];
  const literal = isIP(host);
  if (literal !== 0) {
    addresses = [{ address: host, family: literal }];
  } else {
    try {
      const resolved = await lookup(host, { all: true, verbatim: true });
      addresses = resolved.map(({ address, family }) => ({ address, family }));
    } catch (err) {
      throw new HostLookupFailed(err);
    }
  }
  if (addresses.length === 0) throw new HostLookupFailed();
  if (!isAllowed && addresses.some(({ address }) => isInternalAddress(address)))
    throw new ImportTargetNotAllowed();
  return { url: target, host, addresses };
}

type LookupAllCallback = (
  err: NodeJS.ErrnoException | null,
  addresses: VettedAddress[],
) => void;

/** A connect-time lookup that only answers the vetted addresses */
function pinnedLookup(vetted: VettedUrl): LookupFunction {
  return (hostname, options, callback) => {
    const candidates = vetted.addresses.filter(
      ({ family }) => !options.family || options.family === family,
    );
    if (bareHost(hostname) !== vetted.host || candidates.length === 0) {
      const err: NodeJS.ErrnoException = new Error(
        `Refused lookup of ${hostname}`,
      );
      err.code = "ENOTFOUND";
      callback(err, "", 0);
      return;
    }
    if (options.all) {
      (callback as unknown as LookupAllCallback)(null, candidates);
      return;
    }
    callback(null, candidates[0]!.address, candidates[0]!.family);
  };
}

interface PinnedRequestInit extends OutboundPolicy {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Give up when the whole request takes longer (default 30 s) */
  timeoutMs?: number;
  /** Largest response body read (default 20 MB) */
  maxBodyBytes?: number;
  /** CA certificates (PEM) to trust instead of the default roots */
  ca?: string;
}

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function toHeaders(raw: IncomingMessage["headers"]): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      headers.append(name, v);
    }
  }
  return headers;
}

/**
 * Fetch a url, connecting only to the addresses `resolveOutboundUrl` vetted.
 * TLS checks the original hostname and redirects are never followed.
 * @throws {ImportTargetNotAllowed}
 */
export async function pinnedFetch(
  url: string | URL,
  init: PinnedRequestInit = {},
): Promise<Response> {
  const vetted = await resolveOutboundUrl(url, init);
  const target = vetted.url;
  const isHttps = target.protocol === "https:";
  const timeoutMs = init.timeoutMs ?? 30_000;
  const maxBodyBytes = init.maxBodyBytes ?? 20 * 1024 * 1024;
  const request = isHttps ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const req = request(
      {
        protocol: target.protocol,
        host: vetted.host,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: init.method ?? "GET",
        headers: init.headers,
        lookup: pinnedLookup(vetted),
        // A fresh socket per request, never a pooled one
        agent: false,
        ...(isHttps && init.ca ? { ca: init.ca } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBodyBytes) {
            reject(new Error("Response body too large"));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (size > maxBodyBytes) return;
          try {
            const status = res.statusCode ?? 0;
            if (status < 200 || status > 599) {
              throw new Error(`Unexpected status ${status}`);
            }
            const body = NULL_BODY_STATUSES.has(status)
              ? null
              : Buffer.concat(chunks);
            resolve(
              new Response(body, {
                status,
                statusText: res.statusMessage ?? "",
                headers: toHeaders(res.headers),
              }),
            );
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      },
    );
    const deadline = setTimeout(() => {
      req.destroy(new Error(`Request timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
