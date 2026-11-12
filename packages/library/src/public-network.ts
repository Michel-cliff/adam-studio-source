import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import { Transform } from "node:stream";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(address, prefix);
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export async function publicEndpoint(host: string) {
  const hostname = host.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new Error("This network destination is not public.");
  }
  return addresses.find(({ family }) => family === 4) ?? addresses[0]!;
}

export function limitBytes(max: number): Transform {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > max) done(new Error("This file exceeds the allowed size."));
      else done(null, chunk);
    },
  });
}

export async function openPublicDownload(input: string, signal: AbortSignal, allowed?: (url: string) => boolean): Promise<IncomingMessage> {
  let url = new URL(input);
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        (allowed && !allowed(url.href))) throw new Error("The download was sent elsewhere or is not allowed.");
    signal.throwIfAborted();
    const endpoint = await publicEndpoint(url.hostname);
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      // Connect to the validated address and authenticate TLS against the original hostname.
      const req = request({
        hostname: endpoint.address, port: 443, servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
        path: url.pathname + url.search, headers: { Host: url.host, "User-Agent": "AdamStudio/0.1" },
        signal, agent: false,
      }, resolve);
      req.once("error", reject);
      req.end();
    });
    const status = response.statusCode ?? 0;
    if (status >= 200 && status < 300) return response;
    const location = response.headers.location;
    response.destroy();
    if (status < 300 || status >= 400 || !location) throw new Error("Download failed: HTTP " + status);
    url = new URL(location, url);
  }
  throw new Error("Too many download redirects.");
}
