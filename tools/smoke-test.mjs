import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT_DIR = fileURLToPath(new URL("..", import.meta.url));
const VITE_BIN = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const READY_TIMEOUT_MS = 30_000;

test("built worker serves the starter homepage and /api/hello", async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const preview = spawnVitePreview(port);

  try {
    await waitUntilReady(preview, baseUrl);

    const home = await fetch(baseUrl);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Build Next\.js-style apps with Vite and deploy them to the edge\./);

    const hello = await fetch(`${baseUrl}/api/hello`);
    assert.equal(hello.status, 200);
    assert.deepEqual(await hello.json(), {
      message: "Hello from vinext on Cloudflare Workers",
    });
  } finally {
    await stopProcess(preview);
  }
});

test("preview refuses to start on an already-occupied port", async () => {
  const occupied = createServer();
  const port = await new Promise((resolve, reject) => {
    occupied.once("error", reject);
    occupied.listen(0, "127.0.0.1", () => resolve(occupied.address().port));
  });

  try {
    const preview = spawnVitePreview(port);
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
    await new Promise((resolve) => occupied.close(resolve));
  }
});

function spawnVitePreview(port) {
  return spawn(process.execPath, [VITE_BIN, "preview", "--port", String(port), "--strictPort"], {
    cwd: ROOT_DIR,
    stdio: "ignore",
  });
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
          await fetch(baseUrl);
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
