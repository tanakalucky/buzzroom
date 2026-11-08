import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyHostedPreview } from "./e2e/preflight.ts";

test("実アプリの到達確認に成功してから UI シナリオへ進む", async () => {
  await verifyHostedPreview(client());
});

for (const status of [302, 401, 403, 503]) {
  test(`Preview が HTTP ${status} を返したらゲーム操作前に停止する`, async () => {
    await assert.rejects(verifyHostedPreview(client(status)), /到達できません/);
  });
}

test("200のAccessログインHTMLをアプリの成功応答にしない", async () => {
  await assert.rejects(verifyHostedPreview(client(200, "text/html")), /到達できません/);
});

test("別アプリのJSONを成功応答にしない", async () => {
  await assert.rejects(
    verifyHostedPreview(client(200, "application/json", { message: "other" })),
    /一致しません/,
  );
});

function client(
  status = 200,
  contentType = "application/json",
  body = { message: "Hello from vinext on Cloudflare Workers" },
) {
  return {
    get: async (path, options) => {
      assert.equal(path, "/api/hello");
      assert.equal(options.maxRedirects, 0);
      return {
        status: () => status,
        headers: () => ({ "content-type": contentType }),
        json: async () => body,
      };
    },
  };
}
