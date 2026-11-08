import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guardRequest,
  guardWebSocket,
  createAppContext,
  closeAppContexts,
} from "./e2e/origin-guard.ts";

const origin = "https://12345678-buzzroom.luckyyeslucky777.workers.dev";

function routeFixture(url, status = 200, location) {
  const operations = [];
  return {
    operations,
    route: {
      request: () => ({
        url: () => url,
        method: () => "GET",
        allHeaders: async () => ({ origin }),
      }),
      abort: async () => operations.push("abort"),
      fetch: async (options) => {
        assert.equal(options.maxRedirects, 0);
        assert.deepEqual(options.headers, { origin });
        operations.push("fetch");
        return {
          status: () => status,
          headers: () => ({ location }),
          dispose: async () => operations.push("dispose"),
        };
      },
      fulfill: async () => operations.push("fulfill"),
    },
  };
}

test("Preview の HTTP 応答を redirect 自動追従なしで取得する", async () => {
  const { route, operations } = routeFixture(`${origin}/room/test`);

  await guardRequest(route, origin, () => assert.fail("遮断不要"));

  assert.deepEqual(operations, ["fetch", "fulfill", "dispose"]);
});

for (const url of [
  "https://buzzroom.tanakalucky.com/",
  "https://example.test/",
  `${origin}.evil.test/`,
  "http://12345678-buzzroom.luckyyeslucky777.workers.dev/",
]) {
  test(`許可 origin 以外の ${new URL(url).hostname} への要求を送信前に遮断する`, async () => {
    const { route, operations } = routeFixture(url);
    let blocked = false;

    await guardRequest(route, origin, () => {
      blocked = true;
    });

    assert.equal(blocked, true);
    assert.deepEqual(operations, ["abort"]);
  });
}

for (const status of [301, 302, 303, 307, 308]) {
  test(`${status} redirect が本番を指すと追従せず遮断する`, async () => {
    const { route, operations } = routeFixture(
      `${origin}/create`,
      status,
      "https://buzzroom.tanakalucky.com/create",
    );
    let blocked = false;

    await guardRequest(route, origin, () => {
      blocked = true;
    });

    assert.equal(blocked, true);
    assert.deepEqual(operations, ["fetch", "abort", "dispose"]);
  });
}

test("同じ Preview の相対 redirect はブラウザへ返す", async () => {
  const { route, operations } = routeFixture(`${origin}/create`, 303, "/room/test");

  await guardRequest(route, origin, () => assert.fail("遮断不要"));

  assert.deepEqual(operations, ["fetch", "fulfill", "dispose"]);
});

test("外部 WebSocket は接続せず閉じる", () => {
  const operations = [];
  const socket = {
    url: () => "wss://buzzroom.tanakalucky.com/socket",
    close: () => operations.push("close"),
    connectToServer: () => operations.push("connect"),
  };

  guardWebSocket(socket, origin, () => operations.push("blocked"));

  assert.deepEqual(operations, ["blocked", "close"]);
});

test("同じ Preview の wss は対応する https origin と照合して接続する", () => {
  const operations = [];
  const socket = {
    url: () => origin.replace("https:", "wss:") + "/socket",
    close: () => operations.push("close"),
    connectToServer: () => operations.push("connect"),
  };

  guardWebSocket(socket, origin, () => operations.push("blocked"));

  assert.deepEqual(operations, ["connect"]);
});

test("context は Service Worker を遮断し HTTP/WS 両方を制限、遮断があればテストを失敗にする", async () => {
  let handler;
  let socketHandler;
  let closed = false;
  const fakeContext = {
    route: async (_pattern, callback) => {
      handler = callback;
    },
    routeWebSocket: async (_pattern, callback) => {
      socketHandler = callback;
    },
    close: async () => {
      closed = true;
    },
  };
  const browser = {
    newContext: async (options) => {
      assert.equal(options.serviceWorkers, "block");
      assert.equal(options.baseURL, origin + "/");
      return fakeContext;
    },
  };
  const context = await createAppContext(browser, origin + "/");
  assert.equal(typeof socketHandler, "function");
  const { route } = routeFixture("https://buzzroom.tanakalucky.com/create");

  await handler(route);

  await assert.rejects(closeAppContexts([context]), /E2E は失敗/);
  assert.equal(closed, true);
});
