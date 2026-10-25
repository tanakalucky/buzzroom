import { roomStub } from "./binding";
import { hashToken } from "./security";
import type { QAProbe, ServerMessage, Snapshot } from "../types";

type AppFetch = (request: Request) => Promise<Response>;
type Result = { check: string; passed: boolean; [key: string]: unknown };
const check = (condition: unknown) => {
  if (!condition) throw Error("QA assertion failed");
};
const stateJSON = ({ onlineIds: _online, ...state }: Snapshot) => JSON.stringify(state);

// 値は返さない。実Server Actionsが発行したSet-Cookieの属性だけを比較する。
export function cookieAttributes(raw: string, path: string, now = Date.now()) {
  const attributes = raw
    .split(";")
    .slice(1)
    .map((s) => s.trim());
  const value = (name: string) =>
    attributes.find((s) => s.toLowerCase().startsWith(name + "="))?.slice(name.length + 1);
  return {
    httpOnly: attributes.some((s) => s.toLowerCase() === "httponly"),
    secure: attributes.some((s) => s.toLowerCase() === "secure"),
    sameSite: value("samesite"),
    roomPath: value("path") === path,
    lifetimeSeconds: Math.round((Date.parse(value("expires") ?? "") - now) / 1000),
  };
}

class Client {
  readonly messages: ServerMessage[] = [];
  private listeners = new Set<() => void>();
  closed = false;
  constructor(readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(String(event.data)));
      for (const listener of this.listeners) listener();
    });
    socket.addEventListener("close", () => {
      this.closed = true;
    });
    socket.addEventListener("error", () => {
      this.closed = true;
    });
    socket.accept();
  }
  wait(type: ServerMessage["type"], after: number): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(read);
        reject(Error("QA message timeout"));
      }, 10000);
      const read = () => {
        const message = this.messages.slice(after).find((m) => m.type === type);
        if (message) {
          clearTimeout(timer);
          this.listeners.delete(read);
          resolve(message);
        }
      };
      this.listeners.add(read);
      read();
    });
  }
  async command(command: object, type: ServerMessage["type"] = "snapshot") {
    const after = this.messages.length;
    this.socket.send(JSON.stringify(command));
    const result = await this.wait(type, after);
    // 同じ接続でのprobeを後続させ、別接続の古いbroadcastを操作完了と誤認しない。
    if (type === "snapshot") await this.probe();
    return result;
  }
  async probe() {
    return (await this.command({ type: "qa:probe" }, "qa")) as QAProbe;
  }
}

function formData(html: string, name: string, password: string) {
  const data = new FormData();
  const decode = (s: string) =>
    s.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
  const form = html.match(/<form[^>]*>[\s\S]*?<\/form>/)?.[0];
  check(form);
  for (const match of form!.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const key = /name="([^"]+)"/.exec(match[0])?.[1];
    if (key) data.append(decode(key), decode(/value="([^"]*)"/.exec(match[0])?.[1] ?? ""));
  }
  data.set("name", name);
  data.set("password", password);
  return data;
}

// ユーザーのCookieを転送しない。新規の架空ルームだけで通常のアプリ入口を検証する。
async function* runChecks(origin: string, appFetch: AppFetch): AsyncGenerator<Result, void> {
  const clients: Client[] = [];
  let phase = "start";
  try {
    const request = (path: string, init: RequestInit = {}) =>
      new Request(origin + path, {
        ...init,
        headers: {
          Host: new URL(origin).host,
          Origin: origin,
          ...Object.fromEntries(new Headers(init.headers)),
        },
      });
    phase = "cookie-root";
    const root = await appFetch(request("/"));
    check(root.status === 200);
    phase = "cookie-create";
    const password = crypto.randomUUID();
    const created = await appFetch(
      request("/", { method: "POST", body: formData(await root.text(), "QA計測司会", password) }),
    );
    check(created.status === 303);
    const path = new URL(created.headers.get("location")!, origin).pathname;
    const roomId = path.split("/")[2];
    const rawHost = created.headers.get("set-cookie") ?? "";
    const hostCookie = rawHost.split(";")[0];
    const attrs = cookieAttributes(rawHost, path);
    phase = "cookie-attributes";
    const attributesPass = Boolean(
      attrs.httpOnly &&
      attrs.secure &&
      attrs.sameSite?.toLowerCase() === "strict" &&
      attrs.roomPath &&
      attrs.lifetimeSeconds > 86380 &&
      attrs.lifetimeSeconds <= 86401,
    );
    await created.arrayBuffer();
    yield {
      check: phase,
      passed: attributesPass,
      layer: "hosted-worker-emitted-http-header",
      ...attrs,
    };
    if (!attributesPass) return;
    const gate = await appFetch(request(path));
    check(gate.status === 200);
    const html = await gate.text();
    const cookies = [hostCookie];
    for (const name of ["QA計測一", "QA計測二"]) {
      const joined = await appFetch(
        request(path, { method: "POST", body: formData(html, name, password) }),
      );
      check(joined.status === 303);
      cookies.push((joined.headers.get("set-cookie") ?? "").split(";")[0]);
      await joined.arrayBuffer();
    }
    const stub = roomStub(roomId);
    const upgrade = (cookie?: string, wsOrigin: string | null = origin) => {
      const input = request(path + "/socket", {
        headers: { Upgrade: "websocket", ...(cookie ? { Cookie: cookie } : {}) },
      });
      if (wsOrigin === null) input.headers.delete("Origin");
      else input.headers.set("Origin", wsOrigin);
      return stub.fetch(input);
    };
    for (const cookie of cookies) {
      const response = await upgrade(cookie);
      check(response.status === 101 && response.webSocket);
      const client = new Client(response.webSocket!);
      clients.push(client);
      await client.wait("snapshot", 0);
    }
    const [host, one, two] = clients;
    const initial = await host.probe();
    check(initial.state.participants.length === 3);
    const participant = (await one.probe()).state.participants.find(
      (p) => p.id !== initial.state.hostId,
    )!;
    phase = "origin-and-auth-rejection";
    const baseline = stateJSON((await host.probe()).state);
    const statuses: number[] = [];
    for (const wsOrigin of ["https://invalid.example", null]) {
      const rejected = await upgrade(cookies[1], wsOrigin);
      statuses.push(rejected.status);
      check(rejected.status === 403 && !rejected.webSocket);
      await rejected.arrayBuffer();
    }
    const anonymous = await upgrade();
    check(anonymous.status === 401);
    await anonymous.arrayBuffer();
    const badPost = await appFetch(
      request("/", {
        method: "POST",
        headers: { Origin: "https://invalid.example" },
        body: formData(html, "QA拒否", password),
      }),
    );
    check(badPost.status === 403);
    await badPost.arrayBuffer();
    check(stateJSON((await host.probe()).state) === baseline);
    yield {
      check: phase,
      passed: true,
      layer: "application-entry-and-native-roomdo-after-access",
      validUpgrade: 101,
      invalidOriginStatuses: statuses,
      anonymousStatus: 401,
      invalidPost: 403,
      stateUnchanged: true,
    };
    phase = "role-rejection";
    for (const command of [
      { type: "reset" },
      { type: "judge", targetId: participant.id, correct: true },
      { type: "score", targetId: participant.id, correct: 99, wrong: 99 },
      { type: "host", targetId: participant.id },
    ]) {
      const error = await one.command({ ...command, round: initial.state.buzzer.round }, "error");
      check(error.type === "error" && error.code === "forbidden");
      check(stateJSON((await host.probe()).state) === baseline);
    }
    await host.command({ type: "score", round: 1, targetId: participant.id, correct: 2, wrong: 3 });
    check(
      (await host.probe()).state.participants.find((p) => p.id === participant.id)?.correct === 2,
    );
    yield {
      check: phase,
      passed: true,
      rejectedCommands: ["reset", "judge", "score", "host"],
      stateUnchanged: true,
      validHostControl: true,
    };
    phase = "hibernation";
    await one.command({ type: "buzz", round: 1 });
    await two.command({ type: "buzz", round: 1 });
    const pressed = (await host.probe()).state;
    await host.command({
      type: "judge",
      round: 1,
      targetId: pressed.buzzer.queue[0],
      correct: false,
    });
    const before = await one.probe();
    check(
      before.deployment !== "unavailable" &&
        before.socketId !== "unavailable" &&
        before.state.buzzer.blocked.length === 1,
    );
    const digest = await hashToken(stateJSON(before.state));
    yield {
      check: "hibernation-baseline",
      passed: true,
      instance: before.instance,
      deployment: before.deployment,
      socketId: before.socketId,
      stateDigest: digest,
      blocked: 1,
      openSockets: clients.length,
    };
    for (const idleSeconds of [20, 35, 60, 80]) {
      // 時間経過は成功条件ではない。constructor再初期化を同一接続で観測する。
      await new Promise((resolve) => setTimeout(resolve, idleSeconds * 1000));
      const after = await one.probe();
      check(clients.every((c) => !c.closed && c.socket.readyState === WebSocket.OPEN));
      check(after.deployment === before.deployment && after.socketId === before.socketId);
      check(
        after.acceptedInstance === before.acceptedInstance &&
          (await hashToken(stateJSON(after.state))) === digest,
      );
      if (after.instance !== before.instance) {
        check(after.restoredAttachments === clients.length);
        yield {
          check: phase,
          passed: true,
          previousInstance: before.instance,
          currentInstance: after.instance,
          deployment: after.deployment,
          socketId: after.socketId,
          sameOpenSocket: true,
          reconnected: false,
          redeployed: false,
          restoredAttachments: after.restoredAttachments,
          sqliteStateDigestUnchanged: true,
        };
        return;
      }
      yield {
        check: "hibernation-awaiting-observation",
        passed: false,
        idleSeconds,
        sameInstance: true,
      };
    }
    yield {
      check: phase,
      passed: false,
      reason: "constructor reinitialization not observed within test budget",
    };
  } catch {
    yield { check: phase, passed: false, reason: "assertion failed; no secret values included" };
  } finally {
    for (const client of clients) client.socket.close(1000, "QA complete");
  }
}

export function qaResponse(request: Request, appFetch: AppFetch) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (request.method === "GET")
    return new Response(
      `<!doctype html><html lang="ja"><meta charset="utf-8"><title>buzzroom Preview QA</title><h1>Preview限定の検証</h1><p>既存Access配下で、架空の部屋を作り3点を検証します。Cookie値・パスワードは表示しません。休止の観測は最大約4分です。</p><form method="post"><button>検証を実行</button></form></html>`,
      {
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
        },
      },
    );
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  const iterator = runChecks(new URL(request.url).origin, appFetch);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async pull(controller) {
        const result = await iterator.next();
        if (result.done) controller.close();
        else controller.enqueue(encoder.encode(JSON.stringify(result.value) + "\n"));
      },
      async cancel() {
        await iterator.return();
      },
    }),
    { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } },
  );
}
