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
    [880, 880, 659.25, 987.77, 1318.51, 146.83, 130.81],
  );
  assert.equal(audio.notes.at(-1).type, "square");
  assert.deepEqual(audio.statuses, ["starting", "on"]);
  audio.player.disable();
  audio.player.play("correct");
  await audio.player.enable();
  assert.deepEqual(
    audio.notes.map((n) => n.frequency.value),
    [880, 880, 659.25, 987.77, 1318.51, 146.83, 130.81, 880],
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
    [880, 880],
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

test("BR-SOUND-CLARITY/1: 受理は単発短音、正解は上昇チャイム、誤答は低い二連ブザーになる", async () => {
  const audio = fixture();
  await audio.player.enable();
  const buzz = audio.notes[0];
  const start = audio.notes.length;

  audio.player.play("correct");
  const correct = audio.notes.slice(start);
  audio.player.play("wrong");
  const wrong = audio.notes.slice(start + correct.length);

  assert.equal(start, 1);
  assert.equal(buzz.type, "triangle");
  assert.ok(buzz.stopAt - buzz.startAt >= 0.06 && buzz.stopAt - buzz.startAt <= 0.1);
  assert.ok(buzz.frequency.value >= 700 && buzz.frequency.value <= 1100);
  assert.equal(correct.length, 3);
  assert.ok(correct.every((note) => note.type === "sine"));
  for (let i = 1; i < correct.length; i++) {
    assert.ok(correct[i].frequency.value > correct[i - 1].frequency.value);
    assert.ok(correct[i].startAt > correct[i - 1].startAt);
    assert.ok(correct[i].startAt < correct[i - 1].stopAt);
  }
  assert.ok(correct.at(-1).frequency.value / correct[0].frequency.value >= 1.9);
  assert.ok(correct.at(-1).stopAt - correct[0].startAt <= 0.5);
  assert.equal(wrong.length, 2);
  assert.ok(
    wrong.every(
      (note) => note.type === "square" && note.frequency.value >= 100 && note.frequency.value < 200,
    ),
  );
  assert.ok(wrong[1].startAt > wrong[0].stopAt);
  assert.ok(wrong[1].frequency.value < wrong[0].frequency.value);
  assert.ok(wrong.at(-1).stopAt - wrong[0].startAt <= 0.35);
  audio.player.dispose();
});

test("BR-SOUND-CLARITY/1: 全音に短い立上りとゼロまでの減衰を付け、終了後にノードを解放する", async () => {
  const audio = fixture();
  await audio.player.enable();
  audio.player.play("correct");
  audio.player.play("wrong");

  for (const note of audio.notes) {
    const gain = note.output;
    const [zero, attack, decay, end] = gain.events;
    assert.deepEqual(zero, ["set", 0, note.startAt]);
    assert.equal(attack[0], "linear");
    assert.ok(attack[1] > 0 && attack[1] <= (note.type === "square" ? 0.04 : 0.1));
    assert.ok(attack[2] > note.startAt && attack[2] - note.startAt <= 0.01);
    assert.equal(decay[0], "exponential");
    assert.ok(decay[1] > 0 && decay[1] <= 0.001);
    assert.ok(decay[2] > attack[2] && decay[2] < note.stopAt);
    assert.deepEqual(end, ["linear", 0, note.stopAt]);
    assert.equal(gain.output, audio.contexts[0].destination);
    note.onended();
    assert.equal(note.disconnected, true);
    assert.equal(gain.disconnected, true);
  }
  audio.player.dispose();
  assert.ok(audio.notes.every((note) => note.stops.length === 1));
});

test("BR-SOUND-CLARITY/1: オフで予約済み音も即停止し、開始失敗時も接続を解放する", async () => {
  for (const options of [{}, { startFailsAt: 3 }]) {
    const audio = fixture(options);
    await audio.player.enable();

    audio.player.play("correct");
    if (!options.startFailsAt) audio.player.disable();

    assert.ok(
      audio.created.every((note) => note.stops.length > 0 && note.stops.at(-1) === undefined),
    );
    assert.ok(audio.created.every((note) => note.disconnected && note.output.disconnected));
    assert.equal(audio.contexts[0].closed, true);
    assert.equal(audio.statuses.at(-1), options.startFailsAt ? "unavailable" : "off");
  }
});

function fixture(options = {}) {
  const statuses = [];
  const contexts = [];
  const notes = [];
  const created = [];
  let resolveResume;
  const player = createRoomSound(
    (status) => statuses.push(status),
    () => {
      if (options.unsupported) throw new Error("AudioContext unavailable");
      const context = {
        state: "suspended",
        currentTime: 10,
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
            stops: [],
            connect(output) {
              this.output = output;
            },
            disconnect() {
              this.disconnected = true;
            },
            start(at) {
              if (options.startFailsAt === created.length) throw new Error("start failed");
              this.startAt = at;
              notes.push(this);
            },
            stop(at) {
              this.stops.push(at);
              this.stopAt = at;
            },
          };
          created.push(node);
          return node;
        },
        createGain() {
          const events = [];
          return {
            events,
            gain: {
              setValueAtTime(value, at) {
                events.push(["set", value, at]);
              },
              linearRampToValueAtTime(value, at) {
                events.push(["linear", value, at]);
              },
              exponentialRampToValueAtTime(value, at) {
                events.push(["exponential", value, at]);
              },
            },
            connect(output) {
              this.output = output;
            },
            disconnect() {
              this.disconnected = true;
            },
          };
        },
      };
      contexts.push(context);
      return context;
    },
  );
  return { statuses, contexts, notes, created, player, resolveResume: () => resolveResume() };
}
