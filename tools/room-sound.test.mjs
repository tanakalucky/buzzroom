import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoomSound } from "../src/views/room/model/room-sound.ts";

test("BR-SOUND v2: 初期オフで3種類を区別し、オフ中の受理を後から再生しない", async () => {
  const audio = fixture();
  audio.player.play("correct");
  assert.deepEqual(audio.notes, []);

  await audio.player.enable();
  audio.player.play("buzz");
  audio.player.play("correct");
  audio.player.play("wrong");

  assert.deepEqual(
    audio.notes.map((n) => n.frequency.value),
    [1047, 1047, 660, 880, 180],
  );
  assert.equal(audio.notes.at(-1).type, "triangle");
  assert.deepEqual(audio.statuses, ["starting", "on"]);
  audio.player.disable();
  audio.player.play("correct");
  await audio.player.enable();
  assert.deepEqual(
    audio.notes.map((n) => n.frequency.value),
    [1047, 1047, 660, 880, 180, 1047],
  );
  assert.equal(audio.contexts[0].closed, true);
  audio.player.dispose();
});

test("BR-SOUND v2: resume拒否・非対応・再生失敗で通知しゲーム側へ例外を出さない", async () => {
  for (const options of [{ resumeFails: true }, { unsupported: true }, { playFails: true }]) {
    const audio = fixture(options);

    await audio.player.enable();
    assert.doesNotThrow(() => audio.player.play("buzz"));

    assert.equal(audio.statuses.at(-1), "unavailable");
    assert.deepEqual(audio.notes, []);
    audio.player.dispose();
  }
});

test("BR-SOUND v2: 再生停止中のイベントを破棄し、再開後に古い音を鳴らさない", async () => {
  const audio = fixture();
  await audio.player.enable();
  audio.contexts[0].state = "suspended";

  audio.player.play("wrong");
  audio.player.play("correct");
  await audio.player.enable();

  assert.deepEqual(
    audio.notes.map((n) => n.frequency.value),
    [1047, 1047],
  );
  assert.equal(audio.statuses.includes("unavailable"), true);
  audio.player.dispose();
});

test("BR-SOUND v2: resume待ち中にオフ・画面終了したら後から有効化しない", async () => {
  const audio = fixture({ deferredResume: true });
  const enabling = audio.player.enable();

  audio.player.disable();
  audio.resolveResume();
  await enabling;

  assert.deepEqual(audio.statuses, ["starting", "off"]);
  assert.deepEqual(audio.notes, []);
  assert.equal(audio.contexts[0].closed, true);
});

function fixture(options = {}) {
  const statuses = [];
  const contexts = [];
  const notes = [];
  let resolveResume;
  const player = createRoomSound(
    (status) => statuses.push(status),
    () => {
      if (options.unsupported) throw new Error("AudioContext unavailable");
      const context = {
        state: "suspended",
        currentTime: 0,
        destination: {},
        closed: false,
        async resume() {
          if (options.resumeFails) throw new Error("autoplay blocked");
          if (options.deferredResume)
            await new Promise((resolve) => {
              resolveResume = resolve;
            });
          this.state = "running";
        },
        async close() {
          this.closed = true;
          this.state = "closed";
        },
        createOscillator() {
          if (options.playFails) throw new Error("device unavailable");
          const node = {
            frequency: { value: 0 },
            connect() {},
            disconnect() {},
            start() {
              notes.push(this);
            },
            stop() {},
          };
          return node;
        },
        createGain() {
          return {
            gain: {
              setValueAtTime() {},
              linearRampToValueAtTime() {},
              exponentialRampToValueAtTime() {},
            },
            connect() {},
            disconnect() {},
          };
        },
      };
      contexts.push(context);
      return context;
    },
  );
  return { statuses, contexts, notes, player, resolveResume: () => resolveResume() };
}
