import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRoomSound } from "../src/views/room/model/room-sound.ts";

const files = [
  "/sounds/otologic/quiz-button02-1.mp3",
  "/sounds/otologic/quiz-pingpong02-1.mp3",
  "/sounds/otologic/quiz-buzzer02-1.mp3",
];

test("BR-SOUND-FILES/1: 同梱MP3は選択した02-1の3素材とバイト単位で一致する", async () => {
  const expected = [
    [18122, "3830c58f4ab91850213b5ef3fadb9598e664e9606df404972cd0d812ddc1ab33"],
    [20965, "8d9151556720c9e4941fde753a863827439fe842f7d801f94205aaded03fef93"],
    [22356, "39b945203e9dde32a49ba3deb69913aff3c2703c148205e1b665b2ded982b461"],
  ];

  for (const [index, path] of files.entries()) {
    const bytes = await readFile(new URL(`../public${path}`, import.meta.url));
    assert.equal(bytes.length, expected[index][0]);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected[index][1]);
  }
});

test("BR-SOUND-FILES/1: 初期オフでは通信せず、3素材の準備後に早押し音だけ試聴する", async () => {
  const audio = fixture();
  audio.player.play("correct");
  assert.equal(audio.requests.length, 0);
  assert.equal(audio.contexts.length, 0);

  await audio.player.enable();

  assert.deepEqual(
    audio.requests.map((request) => request.url),
    files,
  );
  assert.ok(
    audio.requests.every(({ init }) => init.mode === "same-origin" && init.redirect === "error"),
  );
  assert.equal(audio.contexts[0].decodes.length, 3);
  assert.deepEqual(
    audio.played.map((source) => source.buffer.id),
    [0],
  );
  assert.deepEqual(audio.statuses, ["starting", "on"]);
  audio.player.dispose();
});

test("BR-SOUND-FILES/1: 受理順に対応するbufferを1回ずつ再生し、イベント時は再取得しない", async () => {
  const audio = fixture();
  await audio.player.enable();

  audio.player.play("buzz");
  audio.player.play("correct");
  audio.player.play("wrong");
  audio.player.play("buzz");

  assert.deepEqual(
    audio.played.map((source) => source.buffer.id),
    [0, 0, 1, 2, 0],
  );
  assert.equal(audio.requests.length, 3);
  assert.ok(audio.played.every((source) => source.output === audio.contexts[0].destination));
  assert.ok(audio.played.every((source) => source.starts === 1));
  assert.notEqual(audio.played[0], audio.played[1]);
  audio.player.dispose();
});

test("BR-SOUND-FILES/1: 自然終了したsourceを切断し、オフでは残る全音を停止してcontextを閉じる", async () => {
  const audio = fixture();
  await audio.player.enable();
  audio.player.play("correct");
  const [ended, playing] = audio.played;

  ended.onended();
  audio.player.disable();

  assert.equal(ended.disconnects, 1);
  assert.equal(ended.stops, 0);
  assert.equal(playing.stops, 1);
  assert.equal(playing.disconnects, 1);
  assert.equal(playing.onended, null);
  assert.equal(audio.contexts[0].closes, 1);
  assert.equal(audio.statuses.at(-1), "off");
});

test("BR-SOUND-FILES/1: オフ中のイベントを再生せず、再オン時は新しいcontextで試聴だけ行う", async () => {
  const audio = fixture();
  await audio.player.enable();

  audio.player.disable();
  audio.player.play("wrong");
  await audio.player.enable();

  assert.deepEqual(
    audio.played.map((source) => source.buffer.id),
    [0, 0],
  );
  assert.equal(audio.contexts.length, 2);
  assert.equal(audio.contexts[0].state, "closed");
  assert.equal(audio.contexts[1].decodes.length, 3);
  audio.player.dispose();
});

for (const phase of ["resume", "fetch", "decode"]) {
  test(`BR-SOUND-FILES/1: ${phase}待ち中のイベントを捨て、準備完了後に遅れて再生しない`, async () => {
    const gate = deferred();
    const audio = fixture({ [`${phase}Gate`]: gate });
    const enabling = audio.player.enable();
    await tick();

    audio.player.play("correct");
    audio.player.play("wrong");
    assert.equal(audio.played.length, 0);
    gate.resolve();
    await enabling;

    assert.deepEqual(
      audio.played.map((source) => source.buffer.id),
      [0],
    );
    assert.deepEqual(audio.statuses, ["starting", "on"]);
    audio.player.dispose();
  });

  test(`BR-SOUND-FILES/1: ${phase}待ちでオフにした古い処理は、新しいオンを上書きしない`, async () => {
    const gate = deferred();
    const options = { [`${phase}Gate`]: gate };
    const audio = fixture(options);
    const oldEnable = audio.player.enable();
    await tick();

    audio.player.disable();
    assert.ok(audio.requests.every(({ init }) => init.signal.aborted));
    options[`${phase}Gate`] = undefined;
    await audio.player.enable();
    gate.resolve();
    await oldEnable;

    assert.deepEqual(audio.statuses, ["starting", "off", "starting", "on"]);
    assert.deepEqual(
      audio.played.map((source) => source.buffer.id),
      [0],
    );
    assert.equal(audio.contexts[0].closes, 1);
    assert.equal(audio.contexts[1].state, "running");
    audio.player.dispose();
  });
}

test("BR-SOUND-FILES/1: 準備中やオン状態での重複enableは取得と試聴を増やさない", async () => {
  const gate = deferred();
  const audio = fixture({ fetchGate: gate });
  const first = audio.player.enable();

  await audio.player.enable();
  gate.resolve();
  await first;
  await audio.player.enable();

  assert.equal(audio.contexts.length, 1);
  assert.equal(audio.requests.length, 3);
  assert.equal(audio.played.length, 1);
  audio.player.dispose();
});

for (const failure of [
  "unsupported",
  "resume",
  "http",
  "fetch",
  "body",
  "decode",
  "createSource",
  "start",
]) {
  test(`BR-SOUND-FILES/1: ${failure}失敗はゲームに例外を出さず、再試行で復帰する`, async () => {
    const options = { failure };
    const audio = fixture(options);

    await assert.doesNotReject(audio.player.enable());
    assert.doesNotThrow(() => audio.player.play("wrong"));

    assert.equal(audio.statuses.at(-1), "unavailable");
    assert.equal(audio.played.length, 0);
    assert.ok(audio.contexts.every((context) => context.state === "closed"));
    assert.ok(audio.created.every((source) => source.disconnects === 1));
    options.failure = undefined;
    await audio.player.enable();
    assert.equal(audio.statuses.at(-1), "on");
    assert.deepEqual(
      audio.played.map((source) => source.buffer.id),
      [0],
    );
    audio.player.dispose();
  });
}

test("BR-SOUND-FILES/1: 再生中のsuspendは失敗表示にし、破棄した受理を再開後に鳴らさない", async () => {
  const audio = fixture();
  await audio.player.enable();
  audio.contexts[0].state = "suspended";

  audio.player.play("correct");
  await audio.player.enable();

  assert.deepEqual(
    audio.played.map((source) => source.buffer.id),
    [0, 0],
  );
  assert.ok(audio.statuses.includes("unavailable"));
  audio.player.dispose();
});

test("BR-SOUND-FILES/1: dispose後に古いdecodeが失敗しても状態通知や音を復活させない", async () => {
  const gate = deferred();
  const audio = fixture({ decodeGate: gate });
  const enabling = audio.player.enable();
  await tick();

  audio.player.dispose();
  gate.reject(new Error("old decode failed"));
  await enabling;

  assert.deepEqual(audio.statuses, ["starting"]);
  assert.equal(audio.played.length, 0);
  assert.equal(audio.contexts[0].closes, 1);
});

function fixture(options = {}) {
  const statuses = [];
  const contexts = [];
  const requests = [];
  const created = [];
  const played = [];
  const player = createRoomSound(
    (status) => statuses.push(status),
    () => {
      if (options.failure === "unsupported") throw new Error("unsupported");
      const context = {
        state: "suspended",
        destination: {},
        closes: 0,
        decodes: [],
        async resume() {
          if (options.failure === "resume") throw new Error("resume failed");
          if (options.resumeGate) await options.resumeGate.promise;
          if (this.state !== "closed") this.state = "running";
        },
        async close() {
          this.closes++;
          this.state = "closed";
        },
        async decodeAudioData(bytes) {
          this.decodes.push(bytes);
          if (options.failure === "decode") throw new Error("decode failed");
          if (options.decodeGate) await options.decodeGate.promise;
          return { id: new Uint8Array(bytes)[0] };
        },
        createBufferSource() {
          if (options.failure === "createSource") throw new Error("source failed");
          const source = {
            starts: 0,
            stops: 0,
            disconnects: 0,
            connect(output) {
              this.output = output;
            },
            disconnect() {
              this.disconnects++;
            },
            start() {
              if (options.failure === "start") throw new Error("start failed");
              this.starts++;
              played.push(this);
            },
            stop() {
              this.stops++;
            },
          };
          created.push(source);
          return source;
        },
      };
      contexts.push(context);
      return context;
    },
    async (url, init) => {
      requests.push({ url, init });
      if (options.failure === "fetch") throw new Error("fetch failed");
      if (options.fetchGate) await options.fetchGate.promise;
      return {
        ok: options.failure !== "http",
        async arrayBuffer() {
          if (options.failure === "body") throw new Error("body failed");
          return new Uint8Array([files.indexOf(url)]).buffer;
        },
      };
    },
  );
  return { statuses, contexts, requests, created, played, player };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
