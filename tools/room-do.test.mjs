import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import WebSocket from "ws";
import {
  cookieName,
  hashToken,
  randomToken,
  SESSION_MS,
} from "../src/features/room/server/security.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = join(root, ".cloudflare/output/v0/workers/default/bundle");
function client(url, cookie, origin = new URL(url).origin.replace(/^ws/, "http")) {
  const ws = new WebSocket(url, {
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
  });
  const messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  const until = async (predicate) => {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const found = messages.findLast(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw Error("WebSocket did not deliver the expected state");
  };
  return { ws, messages, until, send: (command) => ws.send(JSON.stringify(command)) };
}
async function rejected(url, cookie, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: { ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(Error("Upgrade rejection timeout"));
    }, 5000);
    ws.on("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      response.resume();
      ws.terminate();
      resolve(response.statusCode);
    });
    ws.on("open", () => {
      clearTimeout(timer);
      ws.terminate();
      reject(Error("Unauthorized upgrade accepted"));
    });
    ws.on("error", () => {});
  });
}

test(
  "RoomDO: real sockets, authorization, order, persistence and fixed session expiry",
  { timeout: 120000 },
  async () => {
    const persist = await mkdtemp(join(tmpdir(), "buzzroom-do-test-"));
    const modules = [
      { type: "ESModule", path: join(bundle, "index.js") },
      ...(await readdir(bundle, { recursive: true }))
        .filter((p) => p.endsWith(".js") && p !== "index.js")
        .map((p) => ({ type: "ESModule", path: join(bundle, p) })),
    ];
    const options = {
      name: "buzzroom",
      modules,
      modulesRoot: bundle,
      compatibilityDate: "2026-10-12",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { ROOMS: { className: "RoomDO", useSQLite: true } },
      bindings: { QA_ENABLED: true },
      serviceBindings: { ASSETS: () => new Response("", { status: 404 }) },
      log: new Log(LogLevel.NONE),
    };
    function startRuntime() {
      const converted = convertV4MiniflareOptions(options);
      return new Miniflare({
        ...converted,
        workers: converted.workers.map((worker) => ({
          ...worker,
          dev: { ...worker.dev, unsafeRegisterWorker: false },
        })),
        resourcePersistencePath: persist,
        unsafeInspectDurableObjects: true,
      });
    }
    let mf;
    const clients = [];
    try {
      mf = startRuntime();
      const origin = (await mf.ready).origin;
      const bindings = await mf.getBindings();
      const roomId = crypto.randomUUID();
      const stub = bindings.ROOMS.getByName(roomId);
      const tokens = [randomToken(), randomToken(), randomToken()];
      const hashes = await Promise.all(tokens.map(hashToken));
      const before = Date.now();
      const created = await stub.create("司会", "local-test-password", hashes[0]);
      const issuedExpiry = created.expiresAt;
      assert.equal(created.ok, true);
      assert.ok(
        created.expiresAt >= before + SESSION_MS && created.expiresAt <= Date.now() + SESSION_MS,
      );
      assert.equal((await stub.join("参加", "wrong", hashes[1])).ok, false);
      assert.equal((await stub.join("同じ名前", "local-test-password", hashes[1])).ok, true);
      assert.equal((await stub.join("同じ名前", "local-test-password", hashes[2])).ok, true);
      const cookies = tokens.map((t) => `${cookieName(roomId)}=${t}`);
      const endpoint = origin.replace(/^http/, "ws") + `/room/${roomId}/socket`;
      assert.equal(await rejected(endpoint, cookies[0], "https://evil.invalid"), 403);
      assert.equal(await rejected(endpoint, cookies[0]), 403);
      assert.equal(await rejected(endpoint, undefined, origin), 401);
      assert.equal(await rejected(endpoint, `${cookieName(roomId)}=${randomToken()}`, origin), 401);
      const host = client(endpoint, cookies[0]);
      clients.push(host);
      const one = client(endpoint, cookies[1]);
      clients.push(one);
      const two = client(endpoint, cookies[2]);
      clients.push(two);
      const hs = await host.until((m) => m.type === "snapshot" && m.state.onlineIds.length === 3);
      const a = (await one.until((m) => m.type === "snapshot")).you;
      const b = (await two.until((m) => m.type === "snapshot")).you;
      assert.notEqual(a, b);
      host.send({ type: "qa:probe" });
      const measurement = await host.until((m) => m.type === "qa");
      assert.equal(measurement.instance, measurement.acceptedInstance);
      assert.equal(measurement.restoredAttachments, 0);
      assert.equal(typeof measurement.socketId, "string");
      assert.equal(measurement.state.participants.length, 3);
      for (const secret of [...tokens, ...hashes, "local-test-password", "expiresAt"])
        assert.equal(JSON.stringify(measurement).includes(secret), false);
      const initial = hs.state;
      for (const secret of [...tokens, ...hashes, "local-test-password", "password", "expiresAt"])
        assert.equal(JSON.stringify(hs).includes(secret), false);
      host.send({ type: "buzz", round: 1 });
      await host.until((m) => m.code === "unavailable");
      one.send({ type: "reset", round: 1 });
      await one.until((m) => m.code === "forbidden");
      one.send({ type: "buzz", round: 1 });
      one.send({ type: "buzz", round: 1 });
      await one.until((m) => m.code === "unavailable");
      two.send({ type: "buzz", round: 1 });
      const ordered = await host.until(
        (m) => m.type === "snapshot" && m.state.buzzer.queue.length === 2,
      );
      assert.deepEqual(ordered.state.buzzer.order, [a, b]);
      assert.equal(new Set(ordered.state.buzzer.order).size, 2);
      host.send({ type: "judge", round: 1, targetId: a, correct: false });
      host.send({ type: "judge", round: 1, targetId: a, correct: false });
      const wrong = await host.until(
        (m) => m.type === "snapshot" && m.state.buzzer.blocked.includes(a),
      );
      assert.deepEqual(wrong.state.buzzer.order, [a, b]);
      assert.deepEqual(wrong.state.buzzer.queue, [b]);
      assert.equal(wrong.state.participants.find((p) => p.id === a).wrong, 1);
      await host.until((m) => m.code === "stale");
      one.ws.close();
      const resumed = client(endpoint, cookies[1]);
      clients.push(resumed);
      const recovered = await resumed.until((m) => m.type === "snapshot");
      assert.equal(recovered.you, a);
      assert.deepEqual(recovered.state.buzzer.blocked, [a]);
      assert.deepEqual(recovered.state.buzzer.order, [a, b]);
      resumed.send({ type: "buzz", round: 1 });
      await resumed.until((m) => m.code === "unavailable");
      host.send({ type: "judge", round: 1, targetId: b, correct: true });
      const correct = await host.until((m) => m.type === "snapshot" && m.state.buzzer.round === 2);
      assert.deepEqual(correct.state.buzzer.order, []);
      assert.equal(correct.state.participants.find((p) => p.id === b).correct, 1);
      host.send({ type: "reset", round: 2 });
      host.send({ type: "reset", round: 2 });
      await host.until((m) => m.type === "snapshot" && m.state.buzzer.round === 3);
      host.send({ type: "score", round: 3, targetId: a, correct: -1, wrong: 0 });
      await host.until((m) => m.code === "invalid");
      host.send({ type: "score", round: 3, targetId: a, correct: 5, wrong: 2 });
      await host.until(
        (m) => m.type === "snapshot" && m.state.participants.find((p) => p.id === a)?.correct === 5,
      );
      host.send({ type: "host", round: 3, targetId: b });
      await two.until((m) => m.type === "snapshot" && m.state.hostId === b);
      host.send({ type: "reset", round: 3 });
      await host.until((m) => m.code === "forbidden");
      two.send({ type: "buzz", round: 3 });
      await two.until((m) => m.code === "unavailable");
      host.send({ type: "buzz", round: 3 });
      await host.until((m) => m.type === "snapshot" && m.state.buzzer.queue[0] === initial.hostId);
      two.ws.close();
      await host.until(
        (m) => m.type === "snapshot" && !m.state.onlineIds.includes(b) && m.state.hostId === b,
      );
      const returnedHost = client(endpoint, cookies[2]);
      clients.push(returnedHost);
      await returnedHost.until((m) => m.type === "snapshot");
      returnedHost.send({ type: "judge", round: 3, targetId: initial.hostId, correct: false });
      await host.until(
        (m) => m.type === "snapshot" && m.state.buzzer.blocked.includes(initial.hostId),
      );
      const expiryBefore = (await stub.inspectSession(hashes[0])).expiresAt;
      assert.equal(expiryBefore, issuedExpiry); // 接続・操作・再接続で延長されない。
      for (const c of clients) c.ws.terminate();
      await mf.dispose();
      mf = startRuntime();
      const restoredBindings = await mf.getBindings();
      const restoredStub = restoredBindings.ROOMS.getByName(roomId);
      assert.equal((await restoredStub.inspectSession(hashes[0])).expiresAt, issuedExpiry);
      const nextOrigin = (await mf.ready).origin;
      const nextEndpoint = nextOrigin.replace(/^http/, "ws") + `/room/${roomId}/socket`;
      const restored = client(nextEndpoint, cookies[2]);
      clients.push(restored);
      const persisted = await restored.until((m) => m.type === "snapshot");
      assert.equal(persisted.you, b);
      assert.equal(persisted.state.hostId, b);
      assert.equal(persisted.state.participants.find((p) => p.id === a).correct, 5);
      assert.deepEqual(persisted.state.buzzer.queue, []);
      assert.deepEqual(persisted.state.buzzer.order, [initial.hostId]);
      assert.deepEqual(persisted.state.buzzer.blocked, [initial.hostId]);
      const blockedAgain = client(nextEndpoint, cookies[0]);
      clients.push(blockedAgain);
      await blockedAgain.until((m) => m.type === "snapshot");
      blockedAgain.send({ type: "buzz", round: 3 });
      await blockedAgain.until((m) => m.code === "unavailable");
      const storage = await mf.unsafeGetDurableObjectStorage("buzzroom", "RoomDO", {
        name: roomId,
      });
      await storage.exec(
        "UPDATE sessions SET expires_at=? WHERE hash=?",
        Date.now() - 1,
        hashes[2],
      );
      assert.equal(await restoredStub.inspectSession(hashes[2]), null);
      const closed = new Promise((resolve) => restored.ws.once("close", (code) => resolve(code)));
      restored.send({ type: "reset", round: 3 });
      assert.equal(await closed, 1008);
      assert.equal(await rejected(nextEndpoint, cookies[2], nextOrigin), 401);
    } finally {
      for (const c of clients) c.ws.terminate();
      if (mf) await mf.dispose();
      await rm(persist, { recursive: true, force: true });
    }
  },
);
