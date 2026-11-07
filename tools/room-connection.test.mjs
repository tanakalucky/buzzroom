import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(
    process.env.BR_CONN_SOURCE ??
      new URL("../src/features/room/use-room-connection.ts", import.meta.url),
    "utf8",
  ),
)
  .replace(
    /import \{[^}]+\} from "react";/,
    "const { useState, useRef, useEffect, useCallback } = hooks;",
  )
  .replace("export function useRoomConnection", "function useRoomConnection");

test("BR-CONN/1: 単一socketを同じURLへ開きsnapshot後にonlineになる", () => {
  const room = mountConnection();
  assert.equal(room.value.connection, "connecting");
  assert.equal(room.sockets.length, 1);
  assert.equal(room.sockets[0].url, "wss://quiz.example/room/one/socket");

  room.sockets[0].message(snapshot(2));
  room.flush();

  assert.equal(room.value.connection, "online");
  assert.equal(room.value.you, "participant");
  assert.equal(room.value.state.revision, 2);
  assert.equal(room.sockets.length, 1);
  room.unmount();
});

test("BR-CONN/1: 切断の再試行は1秒から10秒へ増えsnapshotで1秒に戻る", () => {
  const room = mountConnection();

  for (const delay of [1000, 2000, 4000, 8000, 10000, 10000]) {
    room.sockets.at(-1).close(1006);
    room.flush();
    assert.equal(room.value.connection, "offline");
    assert.equal(room.nextDelay(), delay);
    room.retry();
    assert.equal(room.value.connection, "offline");
  }
  room.sockets.at(-1).message(snapshot(3));
  room.flush();
  room.sockets.at(-1).close(1006);

  assert.equal(room.nextDelay(), 1000);
  room.unmount();
});

test("BR-CONN/1: 1008切断はexpiredにしてpendingを解除し再試行しない", () => {
  const room = mountConnection();
  room.sockets[0].message(snapshot(1));
  room.flush();
  room.value.send({ type: "buzz", round: 1 });
  room.flush();
  assert.equal(room.value.pending, true);

  room.sockets[0].close(1008);
  room.flush();

  assert.equal(room.value.connection, "expired");
  assert.equal(room.value.pending, false);
  assert.equal(room.timers.size, 0);
  room.unmount();
});

test("BR-CONN/1: 古revisionを無視し受信ごとに同期送信排他を解除する", () => {
  const room = mountConnection();
  const socket = room.sockets[0];
  socket.message(snapshot(5));
  room.flush();
  const send = room.value.send;

  send({ type: "buzz", round: 1 });
  send({ type: "buzz", round: 1 });
  assert.equal(socket.sent.length, 1);
  room.flush();
  assert.equal(room.value.pending, true);
  socket.message(snapshot(4));
  room.flush();

  assert.equal(room.value.state.revision, 5);
  assert.equal(room.value.pending, false);
  send({ type: "buzz", round: 1 });
  assert.equal(socket.sent.length, 2);
  socket.message({ type: "error", message: "コマンド拒否" });
  room.flush();
  assert.equal(room.value.error, "コマンド拒否");
  assert.equal(room.value.pending, false);
  send({ type: "buzz", round: 1 });
  room.flush();
  assert.equal(socket.sent.length, 3);
  assert.equal(room.value.error, "");
  room.unmount();
});

test("BR-CONN/1: offlineでは送らず再接続後も保留コマンドを自動再送しない", () => {
  const room = mountConnection();
  const socket = room.sockets[0];
  room.value.send({ type: "buzz", round: 1 });
  assert.equal(socket.sent.length, 0);
  socket.message(snapshot(1));
  room.flush();
  room.value.send({ type: "buzz", round: 1 });

  socket.close(1006);
  room.flush();
  room.value.send({ type: "buzz", round: 1 });
  room.retry();
  const reconnected = room.sockets.at(-1);
  reconnected.message(snapshot(2));
  room.flush();

  assert.equal(socket.sent.length, 1);
  assert.equal(reconnected.sent.length, 0);
  assert.equal(room.value.pending, false);
  room.value.send({ type: "buzz", round: 1 });
  assert.equal(reconnected.sent.length, 1);
  room.unmount();
});

test("BR-CONN/1: roomId変更は旧timerとsocketを解放し古い受信を無視する", () => {
  const room = mountConnection();
  const old = room.sockets[0];
  old.close(1006);
  assert.equal(room.timers.size, 1);

  room.changeRoom("two");
  old.message(snapshot(99));
  room.flush();
  room.value.send({ type: "buzz", round: 1 });

  assert.equal(old.closed.at(-1), 1000);
  assert.equal(room.timers.size, 0);
  assert.equal(room.sockets.length, 2);
  assert.equal(room.sockets[1].url, "wss://quiz.example/room/two/socket");
  assert.equal(room.value.state, undefined);
  room.sockets[1].message(snapshot(1));
  room.flush();
  room.value.send({ type: "buzz", round: 1 });
  assert.equal(old.sent.length, 0);
  assert.equal(room.sockets[1].sent.length, 1);
  room.unmount();
});

test("BR-CONN/1: unmountは再接続timerを破棄し1000で切断する", () => {
  const room = mountConnection();
  room.sockets[0].close(1006);
  const retry = [...room.timers.values()][0].callback;

  room.unmount();
  retry();
  room.sockets[0].message(snapshot(9));

  assert.equal(room.timers.size, 0);
  assert.equal(room.sockets[0].closed.at(-1), 1000);
  assert.equal(room.sockets.length, 1);
  assert.equal(room.value.state, undefined);
});

test("BR-CONN/1: 接続済みのroomId変更は既存stateを保持し新socketだけへ送る", () => {
  const room = mountConnection();
  const old = room.sockets[0];
  old.message(snapshot(5));
  room.flush();

  room.changeRoom("two");
  old.message(snapshot(99));
  room.flush();

  assert.equal(room.value.state.revision, 5);
  assert.equal(room.value.connection, "connecting");
  assert.equal(old.closed.at(-1), 1000);
  const current = room.sockets[1];
  current.message(snapshot(6));
  room.flush();
  room.value.send({ type: "buzz", round: 1 });
  assert.equal(room.value.state.revision, 6);
  assert.equal(old.sent.length, 0);
  assert.equal(current.sent.length, 1);
  room.unmount();
});

test("BR-CONN/1: 送信失敗と不正受信は既存errorを示し排他と再接続を扱う", () => {
  const room = mountConnection();
  const socket = room.sockets[0];
  socket.message(snapshot(1));
  room.flush();
  socket.failSend = true;

  room.value.send({ type: "buzz", round: 1 });
  room.flush();
  assert.equal(room.value.pending, false);
  assert.equal(room.value.error, "送信できませんでした。接続を確認してください。");
  socket.failSend = false;
  room.value.send({ type: "buzz", round: 1 });
  assert.equal(socket.sent.length, 1);
  socket.onmessage({ data: "invalid-json" });
  room.flush();

  assert.equal(room.value.error, "状態を受信できませんでした。再接続します。");
  assert.equal(room.value.pending, false);
  assert.equal(room.nextDelay(), 1000);
  room.unmount();
});

function snapshot(revision) {
  return { type: "snapshot", you: "participant", state: { revision } };
}

// このhookのstate/ref/effectだけを制御し、再render前の連打とtimer境界を観測する。
function mountConnection() {
  const slots = [];
  const effects = [];
  const sockets = [];
  const timers = new Map();
  let cursor = 0;
  let dirty = false;
  let roomId = "one";
  let value;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (next) => {
          const result = typeof next === "function" ? next(slots[index]) : next;
          if (!Object.is(slots[index], result)) dirty = true;
          slots[index] = result;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some((dependency, i) => !Object.is(dependency, previous.dependencies[i]))
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: callback() };
        });
      }
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some((dependency, i) => !Object.is(dependency, previous.dependencies[i]))
      ) {
        slots[index] = { dependencies, callback };
      }
      return slots[index].callback;
    },
  };
  class Socket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    closed = [];
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    message(message) {
      this.onmessage({ data: JSON.stringify(message) });
    }
    send(message) {
      if (this.failSend) throw Error("送信失敗fixture");
      this.sent.push(message);
    }
    close(code) {
      this.readyState = 3;
      this.closed.push(code);
      this.onclose?.({ code });
    }
  }
  let timerId = 0;
  const location = { protocol: "https:", host: "quiz.example", origin: "https://quiz.example" };
  const hook = runInNewContext(`${source}\nuseRoomConnection;`, {
    hooks,
    WebSocket: Socket,
    location,
    window: { location },
    setTimeout(callback, delay) {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  function flush() {
    do {
      dirty = false;
      cursor = 0;
      value = hook(roomId);
      while (effects.length) effects.shift()();
    } while (dirty);
  }
  flush();
  return {
    get value() {
      return value;
    },
    sockets,
    timers,
    flush,
    nextDelay() {
      assert.equal(timers.size, 1);
      return [...timers.values()][0].delay;
    },
    retry() {
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers][0];
      timers.delete(id);
      timer.callback();
      flush();
    },
    changeRoom(next) {
      roomId = next;
      flush();
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}
