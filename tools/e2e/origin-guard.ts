import type { Browser, BrowserContext, Route, WebSocketRoute } from "@playwright/test";

const blockedContexts = new WeakSet<BrowserContext>();

export async function createAppContext(browser: Browser, baseURL: string | undefined) {
  if (!baseURL) throw new Error("E2E の対象 URL がありません");
  const origin = new URL(baseURL).origin;
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  const blocked = () => blockedContexts.add(context);

  await context.route("**/*", (route) => guardRequest(route, origin, blocked));
  await context.routeWebSocket("**/*", (socket) => guardWebSocket(socket, origin, blocked));
  return context;
}

export async function closeAppContexts(contexts: BrowserContext[]) {
  const results = await Promise.allSettled(contexts.map((context) => context.close()));
  if (contexts.some((context) => blockedContexts.has(context))) {
    throw new Error("検証対象外の origin への通信を遮断しました。E2E は失敗です");
  }
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

export async function guardRequest(route: Route, origin: string, blocked: () => void) {
  if (!matchesOrigin(route.request().url(), origin)) {
    blocked();
    await route.abort("blockedbyclient");
    return;
  }

  // route.continue だけでは redirect chain の後続 URL を検査できない。
  // 各応答を自動追従なしで取得し、Location を検証してからブラウザに返す。
  const response = await route.fetch({
    maxRedirects: 0,
    headers: await route.request().allHeaders(),
  });
  if (route.request().method() === "POST") console.log("E2E POST status", response.status());
  try {
    const location = response.headers().location;
    if (
      response.status() >= 300 &&
      response.status() < 400 &&
      location &&
      !matchesOrigin(new URL(location, route.request().url()).href, origin)
    ) {
      blocked();
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ response });
  } finally {
    await response.dispose();
  }
}

export function guardWebSocket(socket: WebSocketRoute, origin: string, blocked: () => void) {
  if (!matchesOrigin(socket.url(), origin, true)) {
    blocked();
    socket.close({ code: 1008, reason: "E2E origin restriction" });
    return;
  }
  socket.connectToServer();
}

function matchesOrigin(value: string, origin: string, websocket = false) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (websocket) {
      if (url.protocol !== "ws:" && url.protocol !== "wss:") return false;
      url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    }
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === origin;
  } catch {
    return false;
  }
}
