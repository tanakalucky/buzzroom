import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT_DIR = fileURLToPath(new URL("..", import.meta.url));
const VITE_BIN = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const READY_TIMEOUT_MS = 30_000;

test("built worker serves creation, Server Actions entry and /api/hello", async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stateDir = await mkdtemp(join(tmpdir(), "buzzroom-http-test-"));
  const preview = spawnVitePreview(port, stateDir);

  try {
    await waitUntilReady(preview, baseUrl);

    const home = await fetch(baseUrl);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /ルームをつくる/);
    assert.match(homeHtml, /あなたの名前/);

    const created = await fetch(baseUrl, {
      method: "POST",
      body: entryData(homeHtml, "司会の実通信テスト", "test-room-password"),
      headers: { Origin: baseUrl },
      redirect: "manual",
    });
    assert.equal(created.status, 303);
    const roomPath = new URL(created.headers.get("Location"), baseUrl).pathname;
    assert.match(roomPath, /^\/room\/[a-f0-9-]{36}$/);
    const cookie = created.headers.get("Set-Cookie");
    assert.equal(/HttpOnly/i.test(cookie), true);
    assert.equal(/SameSite=Strict/i.test(cookie), true);
    assert.ok(cookie.includes(`Path=${roomPath}`));
    const expires = /Expires=([^;]+)/i.exec(cookie)[1];
    assert.ok(Math.abs(Date.parse(expires) - Date.now() - 86400000) < 5000);
    await created.arrayBuffer();
    assert.ok(
      (await readdir(stateDir, { recursive: true })).some((path) => path.endsWith(".sqlite")),
      "RoomDOをテスト専用の一時保存先へ永続化する",
    );
    const authenticated = await fetch(baseUrl + roomPath, {
      headers: { Cookie: cookie.split(";")[0] },
    });
    assert.equal(authenticated.status, 200);
    assert.match(authenticated.headers.get("Cache-Control") ?? "", /private|no-store/);
    assert.match(await authenticated.text(), /ルームに接続しています/);
    const gate = await (await fetch(baseUrl + roomPath)).text();
    assert.match(gate, /名前とパスワードで入室/);
    assert.equal(gate.includes("司会の実通信テスト"), false);
    const wrong = await fetch(baseUrl + roomPath, {
      method: "POST",
      body: entryData(gate, "参加者", "wrong"),
      headers: { Origin: baseUrl },
      redirect: "manual",
    });
    assert.equal(wrong.headers.get("Set-Cookie"), null);
    assert.match(await wrong.text(), /パスワードが違います/);
    const joined = await fetch(baseUrl + roomPath, {
      method: "POST",
      body: entryData(gate, "参加者", "test-room-password"),
      headers: { Origin: baseUrl },
      redirect: "manual",
    });
    assert.equal(joined.status, 303);
    assert.equal(new URL(joined.headers.get("Location"), baseUrl).pathname, roomPath);
    assert.equal(/HttpOnly/i.test(joined.headers.get("Set-Cookie")), true);
    await joined.arrayBuffer();
    const forged = await fetch(baseUrl, {
      method: "POST",
      body: entryData(homeHtml, "偽装Origin", "test-room-password"),
      headers: { Origin: "https://evil.invalid" },
      redirect: "manual",
    });
    assert.equal(forged.status, 403);
    assert.equal(forged.headers.get("Set-Cookie"), null);
    await forged.arrayBuffer();
    const missing = await fetch(baseUrl + "/room/00000000-0000-4000-8000-000000000000");
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /ルームが見つかりません/);

    const hello = await fetch(`${baseUrl}/api/hello`);
    assert.equal(hello.status, 200);
    assert.deepEqual(await hello.json(), {
      message: "Hello from vinext on Cloudflare Workers",
    });

    for (const origin of [undefined, baseUrl.replace("http:", "https:")]) {
      const refused = await fetch(baseUrl, {
        method: "POST",
        body: entryData(homeHtml, "Origin検証", "test-room-password"),
        headers: origin ? { Origin: origin } : {},
        redirect: "manual",
      });
      assert.equal(refused.status, 403);
      assert.equal(refused.headers.get("Set-Cookie"), null);
      await refused.arrayBuffer();
    }

    // 元の500を再現した順序を繰り返す。リダイレクトも拒否応答も必ず
    // 読み切る。Worker側もPOST本文を消費し、拒否後の接続resetを防ぐ。
    for (let attempt = 0; attempt < 20; attempt++) {
      const freshHome = await (await fetch(baseUrl)).text();
      const freshCreated = await fetch(baseUrl, {
        method: "POST",
        body: entryData(freshHome, "接続回帰テスト", "test-room-password"),
        headers: { Origin: baseUrl },
        redirect: "manual",
      });
      assert.equal(freshCreated.status, 303);
      const freshRoom = new URL(freshCreated.headers.get("Location"), baseUrl).pathname;
      const freshCookie = freshCreated.headers.get("Set-Cookie").split(";")[0];
      await freshCreated.arrayBuffer();
      const freshAuthenticated = await fetch(baseUrl + freshRoom, {
        headers: { Cookie: freshCookie },
      });
      assert.equal(freshAuthenticated.status, 200);
      await freshAuthenticated.arrayBuffer();
      const freshGate = await (await fetch(baseUrl + freshRoom)).text();
      const freshWrong = await fetch(baseUrl + freshRoom, {
        method: "POST",
        body: entryData(freshGate, "参加者", "wrong"),
        headers: { Origin: baseUrl },
        redirect: "manual",
      });
      assert.equal(freshWrong.headers.get("Set-Cookie"), null);
      assert.match(await freshWrong.text(), /パスワードが違います/);
      const freshJoined = await fetch(baseUrl + freshRoom, {
        method: "POST",
        body: entryData(freshGate, "参加者", "test-room-password"),
        headers: { Origin: baseUrl },
        redirect: "manual",
      });
      assert.equal(freshJoined.status, 303);
      await freshJoined.arrayBuffer();
      const rejected = await fetch(baseUrl, {
        method: "POST",
        body: entryData(freshHome, "拒否確認", "test-room-password"),
        headers: { Origin: "https://evil.invalid" },
        redirect: "manual",
      });
      assert.equal(rejected.status, 403);
      assert.equal(rejected.headers.get("Set-Cookie"), null);
      await rejected.arrayBuffer();
      const absent = await fetch(baseUrl + "/room/00000000-0000-4000-8000-000000000000");
      assert.equal(absent.status, 404);
      assert.match(await absent.text(), /ルームが見つかりません/);
      const healthy = await fetch(baseUrl + "/api/hello");
      assert.equal(healthy.status, 200, `正常APIを異常系フローの後も維持する: ${attempt}`);
      assert.deepEqual(await healthy.json(), {
        message: "Hello from vinext on Cloudflare Workers",
      });
    }
  } finally {
    await stopProcess(preview);
    await rm(stateDir, { recursive: true, force: true });
  }
});

function entryData(html, name, password) {
  const data = new FormData();
  const decode = (value) =>
    value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
  const form = html.match(/<form[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(form, "Entry form must be server rendered");
  for (const input of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const key = /name="([^"]+)"/.exec(input[0])?.[1];
    const value = /value="([^"]*)"/.exec(input[0])?.[1] ?? "";
    if (key) data.append(decode(key), decode(value));
  }
  data.set("name", name);
  data.set("password", password);
  return data;
}

test("preview refuses to start on an already-occupied port", async () => {
  const occupied = createServer();
  const port = await new Promise((resolve, reject) => {
    occupied.once("error", reject);
    occupied.listen(0, "127.0.0.1", () => resolve(occupied.address().port));
  });

  const stateDir = await mkdtemp(join(tmpdir(), "buzzroom-port-test-"));
  const preview = spawnVitePreview(port, stateDir);
  try {
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`expected early exit on occupied port ${port}, but process kept running`));
      }, READY_TIMEOUT_MS);
      preview.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    assert.notEqual(exitCode, 0);
  } finally {
    await stopProcess(preview);
    await new Promise((resolve) => occupied.close(resolve));
    await rm(stateDir, { recursive: true, force: true });
  }
});

function spawnVitePreview(port, stateDir) {
  return spawn(
    process.execPath,
    [VITE_BIN, "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: { ...process.env, BUZZROOM_TEST_STATE: stateDir },
    },
  );
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitUntilReady(preview, baseUrl) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      settle(reject, new Error(`preview server did not start within ${READY_TIMEOUT_MS}ms`));
    }, READY_TIMEOUT_MS);

    preview.once("exit", (code) => {
      settle(reject, new Error(`preview server exited early (code ${code})`));
    });

    (async () => {
      while (!settled) {
        try {
          const ready = await fetch(baseUrl);
          await ready.arrayBuffer();
          if (!ready.ok) throw Error("Preview is not ready");
          settle(resolve);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    })();
  });
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
}
