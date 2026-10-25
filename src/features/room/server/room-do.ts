import { DurableObject } from "cloudflare:workers";
import { initialBuzzer, judgeAnswer, pressBuzzer, resetRound } from "../../buzzer/rules";
import { awardAnswer, isScore } from "../../score/rules";
import { validateDisplayName } from "../input";
import type { RoomState, Snapshot, ServerMessage } from "../types";
import {
  hashToken,
  isRoomId,
  passwordRecord,
  passwordValid,
  readToken,
  sameOrigin,
  SESSION_MS,
  sessionValid,
  verifyPassword,
} from "./security";

type Session = { participantId: string; hash: string; expiresAt: number };
export class RoomDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id=1), state TEXT NOT NULL, password TEXT NOT NULL)",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, participant_id TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    );
  }
  private load(): RoomState | undefined {
    const row = this.ctx.storage.sql
      .exec<{ state: string }>("SELECT state FROM room WHERE id=1")
      .toArray()[0];
    return row ? JSON.parse(row.state) : undefined;
  }
  private save(state: RoomState) {
    this.ctx.storage.sql.exec("UPDATE room SET state=? WHERE id=1", JSON.stringify(state));
  }
  private session(hash: string): Session | undefined {
    const row = this.ctx.storage.sql
      .exec<{ participant_id: string; expires_at: number }>(
        "SELECT participant_id, expires_at FROM sessions WHERE hash=?",
        hash,
      )
      .toArray()[0];
    return row && sessionValid(row.expires_at)
      ? { participantId: row.participant_id, expiresAt: row.expires_at, hash }
      : undefined;
  }
  exists() {
    return !!this.load();
  }
  inspectSession(hash: string) {
    const session = this.session(hash);
    return session ? { participantId: session.participantId, expiresAt: session.expiresAt } : null;
  }
  async create(name: string, password: string, hash: string) {
    const valid = validateDisplayName(name);
    if (!valid.ok || !passwordValid(password) || !/^[a-f0-9]{64}$/.test(hash))
      return { ok: false as const, error: "入力を確認してください。" };
    const record = await passwordRecord(password);
    if (this.load()) return { ok: false as const, error: "ルームは既に存在します。" };
    const participantId = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_MS;
    const state: RoomState = {
      hostId: participantId,
      participants: [{ id: participantId, name: valid.name, correct: 0, wrong: 0 }],
      buzzer: initialBuzzer(),
      revision: 1,
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO room(id,state,password) VALUES(1,?,?)",
        JSON.stringify(state),
        JSON.stringify(record),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO sessions(hash,participant_id,expires_at) VALUES(?,?,?)",
        hash,
        participantId,
        expiresAt,
      );
    });
    return { ok: true as const, expiresAt };
  }
  async join(name: string, password: string, hash: string) {
    const valid = validateDisplayName(name);
    if (!valid.ok || !passwordValid(password) || !/^[a-f0-9]{64}$/.test(hash))
      return { ok: false as const, error: "入力を確認してください。" };
    const row = this.ctx.storage.sql
      .exec<{ password: string }>("SELECT password FROM room WHERE id=1")
      .toArray()[0];
    if (!row) return { ok: false as const, error: "ルームが見つかりません。" };
    if (!(await verifyPassword(password, JSON.parse(row.password))))
      return { ok: false as const, error: "パスワードが違います。もう一度入力してください。" };
    const state = this.load()!;
    const participantId = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_MS;
    state.participants.push({ id: participantId, name: valid.name, correct: 0, wrong: 0 });
    state.revision++;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO sessions(hash,participant_id,expires_at) VALUES(?,?,?)",
        hash,
        participantId,
        expiresAt,
      );
      this.save(state);
    });
    this.broadcast();
    return { ok: true as const, expiresAt };
  }
  private attachment(ws: WebSocket): Session | undefined {
    const value = ws.deserializeAttachment() as Session | null;
    return value &&
      sessionValid(value.expiresAt) &&
      this.session(value.hash)?.participantId === value.participantId
      ? value
      : undefined;
  }
  private snapshot(state: RoomState): Snapshot {
    return {
      hostId: state.hostId,
      participants: state.participants.map((p) => ({
        id: p.id,
        name: p.name,
        correct: p.correct,
        wrong: p.wrong,
      })),
      buzzer: state.buzzer,
      revision: state.revision,
      onlineIds: [
        ...new Set(
          this.ctx.getWebSockets().flatMap((ws) => {
            const s = ws.readyState === WebSocket.OPEN ? this.attachment(ws) : undefined;
            return s ? [s.participantId] : [];
          }),
        ),
      ],
    };
  }
  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      ws.close(1011, "Connection unavailable");
    }
  }
  private broadcast() {
    const state = this.load();
    if (!state) return;
    const snapshot = this.snapshot(state);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const s = this.attachment(ws);
      if (!s) {
        ws.close(1008, "Session expired");
        continue;
      }
      this.send(ws, { type: "snapshot", state: snapshot, you: s.participantId });
    }
  }
  private async scheduleExpiry() {
    const expiry = this.ctx
      .getWebSockets()
      .map((ws) => (ws.deserializeAttachment() as Session | null)?.expiresAt ?? 0)
      .filter((t) => t > Date.now());
    if (expiry.length) await this.ctx.storage.setAlarm(Math.min(...expiry));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    this.broadcast();
    await this.scheduleExpiry();
  }
  async fetch(request: Request) {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    if (!sameOrigin(request.headers.get("Origin"), request.url))
      return new Response("Forbidden", { status: 403 });
    const roomId = new URL(request.url).pathname.split("/")[2] ?? "";
    if (!isRoomId(roomId)) return new Response("Not found", { status: 404 });
    const token = readToken(request.headers.get("Cookie"), roomId);
    const session = token ? this.session(await hashToken(token)) : undefined;
    if (!session || !this.load()) return new Response("Unauthorized", { status: 401 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment(session);
    this.ctx.acceptWebSocket(pair[1]);
    this.broadcast();
    await this.scheduleExpiry();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const session = this.attachment(ws);
    if (!session) {
      ws.close(1008, "Session expired");
      return;
    }
    const reject = (code: string, text: string) =>
      this.send(ws, { type: "error", code, message: text });
    if (typeof message !== "string" || message.length > 4096) {
      reject("invalid", "操作の形式が正しくありません。");
      return;
    }
    let command: Record<string, unknown>;
    try {
      const parsed = JSON.parse(message);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
      command = parsed;
    } catch {
      reject("invalid", "操作の形式が正しくありません。");
      return;
    }
    const state = this.load()!;
    if (command.round !== state.buzzer.round) {
      reject("stale", "ターンが更新されました。最新の状態で操作してください。");
      this.broadcast();
      return;
    }
    if (command.type === "buzz") {
      const next = pressBuzzer(
        state.buzzer,
        session.participantId,
        state.participants.filter((p) => p.id !== state.hostId).map((p) => p.id),
      );
      if (next === state.buzzer) {
        reject("unavailable", "このターンは押せません。");
        return;
      }
      state.buzzer = next;
    } else {
      if (session.participantId !== state.hostId) {
        reject("forbidden", "この操作は出題者だけが行えます。");
        return;
      }
      const target = state.participants.find((p) => p.id === command.targetId);
      switch (command.type) {
        case "judge": {
          if (
            !target ||
            state.buzzer.queue[0] !== target.id ||
            typeof command.correct !== "boolean"
          ) {
            reject("stale", "回答者が変わりました。最新の状態を確認してください。");
            return;
          }
          const score = awardAnswer(target, command.correct);
          if (score === target) {
            reject("invalid", "得点の上限に達しました。");
            return;
          }
          Object.assign(target, score);
          state.buzzer = judgeAnswer(state.buzzer, command.correct);
          break;
        }
        case "reset":
          state.buzzer = resetRound(state.buzzer);
          break;
        case "score":
          if (
            !target ||
            typeof command.correct !== "number" ||
            typeof command.wrong !== "number" ||
            !isScore({ correct: command.correct, wrong: command.wrong })
          ) {
            reject("invalid", "得点は0以上の整数で入力してください。");
            return;
          }
          target.correct = command.correct;
          target.wrong = command.wrong;
          break;
        case "host":
          if (!target || target.id === state.hostId) {
            reject("invalid", "交代する参加者を選んでください。");
            return;
          }
          state.hostId = target.id;
          state.buzzer.queue = state.buzzer.queue.filter((id) => id !== target.id);
          break;
        default:
          reject("invalid", "不明な操作です。");
          return;
      }
    }
    state.revision++;
    this.save(state); // 同期SQLite書き込みが完了してから配信。受信処理間でawaitしない。
    this.broadcast();
  }
  webSocketClose(ws: WebSocket) {
    ws.close(1000, "Connection closed");
    this.broadcast();
    this.ctx.waitUntil(this.scheduleExpiry());
  }
  webSocketError(ws: WebSocket) {
    ws.close(1011, "Connection error");
    this.broadcast();
  }
}
