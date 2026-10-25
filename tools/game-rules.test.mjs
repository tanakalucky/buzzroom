import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialBuzzer,
  pressBuzzer,
  judgeAnswer,
  resetRound,
} from "../src/features/buzzer/rules.ts";
import { awardAnswer, editScore } from "../src/features/score/rules.ts";
import { validateDisplayName } from "../src/features/room/input.ts";
const participants = ["p1", "p2", "p3"];
test("受信処理の呼び出し順だけで押下順を確定し、未押下には順位を付けない", () => {
  let s = initialBuzzer();
  for (const id of ["p3", "p1"]) s = pressBuzzer(s, id, participants);
  assert.deepEqual(s.order, ["p3", "p1"]);
  assert.deepEqual(s.queue, ["p3", "p1"]);
  assert.equal(s.order.includes("p2"), false);
});
test("同じ参加者の連打、司会、未知のIDでは状態を変えない", () => {
  let s = initialBuzzer();
  for (const id of ["host", "unknown"]) assert.equal(pressBuzzer(s, id, participants), s);
  s = pressBuzzer(s, "p1", participants);
  assert.equal(pressBuzzer(s, "p1", participants), s);
});
test("誤答は押下順を保持し回答権だけ送り、誤答者をロックする", () => {
  let s = initialBuzzer();
  for (const id of participants) s = pressBuzzer(s, id, participants);
  s = judgeAnswer(s, false);
  assert.deepEqual(s.order, participants);
  assert.deepEqual(s.queue, ["p2", "p3"]);
  assert.deepEqual(s.blocked, ["p1"]);
  assert.equal(pressBuzzer(s, "p1", participants), s);
});
test("全員誤答でも自動で次ラウンドにせず手動リセットを待つ", () => {
  let s = initialBuzzer();
  for (const id of participants) {
    s = pressBuzzer(s, id, participants);
    s = judgeAnswer(s, false);
  }
  assert.equal(s.round, 1);
  assert.deepEqual(s.blocked, participants);
  assert.deepEqual(s.queue, []);
  assert.equal(judgeAnswer(s, true), s);
  assert.deepEqual(resetRound(s), { round: 2, order: [], queue: [], blocked: [] });
});
test("キューが尽きても未押下者・途中参加者は同じラウンドで押せる", () => {
  let s = judgeAnswer(pressBuzzer(initialBuzzer(), "p1", participants), false);
  s = pressBuzzer(s, "new", [...participants, "new"]);
  assert.equal(s.round, 1);
  assert.deepEqual(s.order, ["p1", "new"]);
  assert.deepEqual(s.queue, ["new"]);
});
test("正解は新ラウンドで押下履歴・待ち・誤答ロックをまとめて消す", () => {
  let s = initialBuzzer();
  for (const id of participants) s = pressBuzzer(s, id, participants);
  s = judgeAnswer(s, false);
  s = judgeAnswer(s, true);
  assert.deepEqual(s, { round: 2, order: [], queue: [], blocked: [] });
});
test("保存・復元したラウンドも誤答ロックと押下順を保持する", () => {
  let s = judgeAnswer(pressBuzzer(initialBuzzer(), "p1", participants), false);
  s = JSON.parse(JSON.stringify(s));
  assert.equal(pressBuzzer(s, "p1", participants), s);
  assert.deepEqual(pressBuzzer(s, "p2", participants).order, ["p1", "p2"]);
});
test("採点を加算し、手動編集の負数・小数・非有限値と桁あふれを拒否する", () => {
  const score = { correct: 2, wrong: 1 };
  assert.deepEqual(awardAnswer(score, true), { correct: 3, wrong: 1 });
  assert.deepEqual(awardAnswer(score, false), { correct: 2, wrong: 2 });
  for (const n of [-1, 0.5, NaN, Infinity])
    assert.equal(editScore(score, { correct: n, wrong: 0 }), score);
  const max = { correct: Number.MAX_SAFE_INTEGER, wrong: 0 };
  assert.equal(awardAnswer(max, true), max);
});
test("表示名は空白を除き24文字まで。同名は識別子として扱わない", () => {
  for (const input of [null, undefined, 123, "　 "])
    assert.equal(validateDisplayName(input).ok, false);
  assert.deepEqual(validateDisplayName("  たなか　"), { ok: true, name: "たなか" });
  assert.equal(validateDisplayName("😀".repeat(24)).ok, true);
  assert.equal(validateDisplayName("名".repeat(25)).ok, false);
});
