import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const PORT = 48173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const READY_TIMEOUT_MS = 30_000;

test("built worker serves the starter homepage and /api/hello", async () => {
  const preview = spawn("npm", ["run", "start", "--", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitUntilReady(preview);

    const home = await fetch(BASE_URL);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Build Next\.js-style apps with Vite and deploy them to the edge\./);

    const hello = await fetch(`${BASE_URL}/api/hello`);
    assert.equal(hello.status, 200);
    assert.deepEqual(await hello.json(), {
      message: "Hello from vinext on Cloudflare Workers",
    });
  } finally {
    preview.kill();
  }
});

function waitUntilReady(preview) {
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
          await fetch(BASE_URL);
          settle(resolve);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    })();
  });
}
