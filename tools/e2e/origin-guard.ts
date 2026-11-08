import { createServer, request as httpRequest, type OutgoingHttpHeaders } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import type { Browser, BrowserContext } from "@playwright/test";

const guards = new WeakMap<BrowserContext, Awaited<ReturnType<typeof createOriginProxy>>>();

export async function createAppContext(browser: Browser, baseURL: string | undefined) {
  if (!baseURL) throw new Error("E2E の対象 URL がありません");
  const proxy = await createOriginProxy(baseURL);
  try {
    const context = await browser.newContext({
      baseURL,
      serviceWorkers: "block",
      // Chromium の既定の loopback bypass も無効にし、ローカル回帰テストにも適用する。
      proxy: { server: proxy.url, bypass: "<-loopback>" },
    });
    guards.set(context, proxy);
    return context;
  } catch (error) {
    await proxy.close();
    throw error;
  }
}

export async function closeAppContexts(contexts: BrowserContext[]) {
  const proxies = contexts.map((context) => guards.get(context));
  const results = await Promise.allSettled(
    contexts.map(async (context, index) => {
      await proxies[index]?.close();
      await context.close();
    }),
  );
  if (proxies.some((proxy) => proxy?.blocked())) {
    throw new Error("検証対象外の origin への通信を遮断しました。E2E は失敗です");
  }
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

export async function createOriginProxy(baseURL: string) {
  const origin = new URL(baseURL);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password)
    throw new Error("E2E の origin が不正です");
  let blocked = false;
  const sockets = new Set<Duplex>();
  const deny = (socket: Duplex) => {
    blocked = true;
    socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  };
  const track = (socket: Duplex) => {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
    return socket;
  };
  const server = createServer((request, response) => {
    if (!allowsRequest(request.url, origin, false)) {
      blocked = true;
      response.writeHead(403).end();
      return;
    }
    const target = new URL(request.url!);
    const headers: OutgoingHttpHeaders = { ...request.headers, host: target.host };
    delete headers["proxy-connection"];
    const upstream = httpRequest(target, { method: request.method, headers }, (incoming) => {
      response.writeHead(incoming.statusCode!, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on("socket", track);
    upstream.on("error", () => response.destroy());
    request.pipe(upstream);
  });
  server.on("connection", track);
  // HTTPS / WebSocket の CONNECT は送信先 authority を接続前に検証する。
  server.on("connect", (request, client, head) => {
    if (!allowsRequest(request.url, origin, true)) return deny(client);
    const remote = track(
      connect(Number(origin.port || (origin.protocol === "https:" ? 443 : 80)), origin.hostname),
    );
    remote.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) remote.write(head);
      client.pipe(remote).pipe(client);
    });
    client.once("close", () => remote.destroy());
    remote.once("close", () => client.destroy());
  });
  server.on("upgrade", (request, client, head) => {
    if (!allowsRequest(request.url, origin, false)) return deny(client);
    const target = new URL(request.url!);
    const remote = track(connect(Number(target.port || 80), target.hostname));
    remote.once("connect", () => {
      const headers: OutgoingHttpHeaders = { ...request.headers, host: target.host };
      delete headers["proxy-connection"];
      remote.write(`${request.method} ${target.pathname}${target.search} HTTP/1.1\r\n`);
      for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) remote.write(`${name}: ${value}\r\n`);
      }
      remote.write("\r\n");
      if (head.length) remote.write(head);
      client.pipe(remote).pipe(client);
    });
    client.once("close", () => remote.destroy());
    remote.once("close", () => client.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("proxy の起動に失敗しました");
  return {
    url: `http://127.0.0.1:${address.port}`,
    blocked: () => blocked,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export function allowsRequest(value: string | undefined, origin: URL, tunnel: boolean) {
  if (!value) return false;
  if (tunnel) {
    return (
      value === `${origin.hostname}:${origin.port || (origin.protocol === "https:" ? 443 : 80)}`
    );
  }
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    // HTTPS は CONNECT のみ。HTTP / ws の平文リクエストを https origin に混ぜない。
    if (url.protocol === "ws:") url.protocol = "http:";
    return url.protocol === "http:" && url.origin === origin.origin;
  } catch {
    return false;
  }
}
