import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createAppContext, closeAppContexts } from "./origin-guard";

test("実ブラウザで別 origin の redirect・POST・WebSocket を送信前に遮断する", async ({
  browser,
}) => {
  let externalRequests = 0;
  let externalConnections = 0;
  let allowedPosts = 0;
  const external = createServer((_request, response) => {
    externalRequests++;
    response.end("unexpected");
  });
  external.on("connection", () => externalConnections++);
  external.on("upgrade", (_request, socket) => {
    externalRequests++;
    socket.destroy();
  });
  const externalURL = await listen(external);
  const externalTLSURL = externalURL.replace("http:", "https:");
  const app = createServer((request, response) => {
    if (request.url === "/safe-redirect") {
      response.writeHead(302, { Location: "/" }).end();
    } else if (request.url === "/tls-redirect") {
      response.writeHead(302, { Location: externalTLSURL }).end();
    } else if (request.url === "/chain") {
      response.writeHead(302, { Location: "/redirect" }).end();
    } else if (request.url === "/redirect" || request.url === "/post-redirect") {
      response
        .writeHead(request.url === "/post-redirect" ? 307 : 302, { Location: externalURL })
        .end();
    } else if (request.method === "POST") {
      allowedPosts++;
      response.setHeader("Content-Type", "text/html");
      response.end("saved");
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<form action="/create" method="POST"><input name="name" value="fixture"><button>作成</button></form>',
      );
    }
  });
  const baseURL = await listen(app);

  try {
    const allowed = await createAppContext(browser, baseURL);
    try {
      const page = await allowed.newPage();
      await test.step("同じ origin の redirect", () => page.goto("/safe-redirect"));
      await test.step("同じ origin の POST", () =>
        page.getByRole("button", { name: "作成" }).click());
      await expect(page.locator("body")).toHaveText("saved");
      expect(allowedPosts).toBe(1);
    } finally {
      await test.step("許可 context の終了", () => closeAppContexts([allowed]));
    }

    for (const path of ["/redirect", "/chain"]) {
      const context = await createAppContext(browser, baseURL);
      const page = await context.newPage();
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
      await expect(closeAppContexts([context])).rejects.toThrow("E2E は失敗");
    }

    for (const action of [externalURL, "/post-redirect"]) {
      const context = await createAppContext(browser, baseURL);
      const page = await context.newPage();
      await page.goto("/");
      await page.locator("form").evaluate((form, target) => {
        (form as HTMLFormElement).action = target;
      }, action);
      await Promise.all([
        page.waitForResponse((response) => response.status() === 403),
        page.getByRole("button", { name: "作成" }).click(),
      ]);
      await expect(closeAppContexts([context])).rejects.toThrow("E2E は失敗");
    }

    const tlsContext = await createAppContext(browser, baseURL);
    const tlsPage = await tlsContext.newPage();
    await expect(tlsPage.goto("/tls-redirect")).rejects.toThrow();
    await expect(closeAppContexts([tlsContext])).rejects.toThrow("E2E は失敗");

    for (const socketURL of [
      externalURL.replace("http:", "ws:"),
      externalTLSURL.replace("https:", "wss:"),
    ]) {
      const socketContext = await createAppContext(browser, baseURL);
      const socketPage = await socketContext.newPage();
      await socketPage.goto("/");
      const socketResult = await socketPage.evaluate(
        (url) =>
          new Promise<string>((resolve) => {
            const socket = new WebSocket(url);
            socket.onclose = () => resolve("closed");
            socket.onerror = () => resolve("error");
            setTimeout(() => resolve("timeout"), 5000);
          }),
        socketURL,
      );
      expect(["closed", "error"]).toContain(socketResult);
      await expect(closeAppContexts([socketContext])).rejects.toThrow("E2E は失敗");
    }
    expect(externalRequests).toBe(0);
    expect(externalConnections).toBe(0);
  } finally {
    await Promise.all([close(app), close(external)]);
  }
});

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("テストサーバーのアドレスがありません");
  return `http://127.0.0.1:${address.port}/`;
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
