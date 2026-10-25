import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";

test(
  "Preview QA: server-issued cookie attributes, native authorization controls and secret-free output",
  { timeout: 60000 },
  async () => {
    const bundle = fileURLToPath(
      new URL("../.cloudflare/output/v0/workers/default/bundle/", import.meta.url),
    );
    const options = convertV4MiniflareOptions({
      name: "buzzroom",
      modulesRoot: bundle,
      modules: [
        { type: "ESModule", path: join(bundle, "index.js") },
        ...(await readdir(bundle, { recursive: true }))
          .filter((p) => p.endsWith(".js") && p !== "index.js")
          .map((p) => ({ type: "ESModule", path: join(bundle, p) })),
      ],
      compatibilityDate: "2026-10-12",
      compatibilityFlags: ["nodejs_compat"],
      bindings: { QA_ENABLED: true },
      durableObjects: { ROOMS: { className: "RoomDO", useSQLite: true } },
      serviceBindings: { ASSETS: () => new Response("", { status: 404 }) },
      log: new Log(LogLevel.NONE),
    });
    const mf = new Miniflare({
      ...options,
      workers: options.workers.map((w) => ({
        ...w,
        dev: { ...w.dev, unsafeRegisterWorker: false },
      })),
    });
    let reader;
    try {
      const result = await mf.dispatchFetch("https://qa.invalid/__qa", {
        method: "POST",
        headers: { Origin: "https://qa.invalid" },
      });
      assert.equal(result.status, 200);
      reader = result.body.getReader();
      const records = [];
      let pending = "";
      while (records.length < 3) {
        const { done, value } = await reader.read();
        assert.equal(done, false);
        pending += new TextDecoder().decode(value);
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) {
          if (line) records.push(JSON.parse(line));
        }
        assert.equal(
          records.slice(0, 3).every((r) => r.passed),
          true,
          JSON.stringify(records),
        );
      }
      assert.equal(records[0].check, "cookie-attributes");
      assert.equal(records[0].secure, true);
      assert.equal(records[0].httpOnly, true);
      assert.equal(records[0].sameSite.toLowerCase(), "strict");
      assert.equal(records[0].roomPath, true);
      assert.ok(records[0].lifetimeSeconds >= 86380 && records[0].lifetimeSeconds <= 86401);
      assert.deepEqual(records[1].invalidOriginStatuses, [403, 403]);
      assert.equal(records[1].anonymousStatus, 401);
      assert.equal(records[1].stateUnchanged, true);
      assert.equal(records[2].validHostControl, true);
      assert.equal(records[2].stateUnchanged, true);
      assert.equal(/set-cookie|password|token|QA計測/.test(JSON.stringify(records)), false);
    } finally {
      if (reader) await reader.cancel();
      await mf.dispose();
    }
  },
);
