import { once } from "node:events";
import { createServer } from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import { publicEndpoint } from "@adam-studio/library/src/public-network";

const MAX_BYTES = 400 * 1024 * 1024;
let active = 0;

/** A job-local HTTPS tunnel for yt-dlp. Resolve and pin every CONNECT destination. */
export async function withReferenceProxy<T>(run: (url: string) => Promise<T>): Promise<T> {
  if (active >= 2) throw new Error("Too many reference downloads are running.");
  active++;
  const sockets = new Set<Socket>();
  let bytes = 0;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
  };
  const server = createServer((_req, res) => res.writeHead(403).end());
  server.on("connection", track);
  server.on("connect", async (req, client, head) => {
    try {
      if (sockets.size > 24 || bytes > MAX_BYTES) throw new Error("Reference download limit reached.");
      const raw = req.url ?? "";
      const target = new URL("https://" + raw);
      if (target.username || target.password || target.pathname !== "/" || target.search || target.hash ||
          (target.port && target.port !== "443") || !raw.endsWith(":443")) throw new Error("HTTPS on port 443 is required.");
      const endpoint = await publicEndpoint(target.hostname);
      if (client.destroyed) return;
      const remote = connect(443, endpoint.address);
      track(remote);
      client.once("close", () => remote.destroy());
      remote.once("close", () => client.destroy());
      remote.setTimeout(30_000, () => remote.destroy());
      remote.once("connect", () => {
        if (client.destroyed) { remote.destroy(); return; }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) remote.write(head);
        remote.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) for (const socket of sockets) socket.destroy();
        });
        client.pipe(remote).pipe(client);
      });
    } catch {
      if (!client.destroyed) client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return await run("http://127.0.0.1:" + (server.address() as AddressInfo).port);
  } finally {
    for (const socket of sockets) socket.destroy();
    if (server.listening) server.close();
    active--;
  }
}
