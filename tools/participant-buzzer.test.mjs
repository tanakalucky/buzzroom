import assert from "node:assert/strict";
import test from "node:test";
import {
  getButtonStatus,
  getCardStatus,
  getParticipantBuzzer,
} from "../src/views/room/model/participant-buzzer.ts";

test("同じラウンドの押下順を保ち、ボタンとカードはそれぞれの優先順位で表示する", () => {
  const buzzer = {
    round: 1,
    order: ["wrong", "formerHost", "active", "next"],
    blocked: ["wrong"],
    queue: ["active", "next"],
  };
  const cases = [
    // ID、押下順、ボタン、カード
    ["wrong", 1, "locked", "× 誤答ロック"],
    ["formerHost", 2, "pressed", "◎ 受付中"],
    ["active", 3, "answering", "● 回答権あり"],
    ["next", 4, "queued", "回答待ち"],
    ["new", null, "ready", "◎ 受付中"],
  ];

  for (const [id, order, button, card] of cases) {
    const participant = getParticipantBuzzer(buzzer, id);

    assert.equal(participant.pressOrder, order, id);
    assert.equal(getButtonStatus(participant, true, false), button, id);
    assert.equal(getButtonStatus(participant, true, true), "sending", id);
    assert.equal(getButtonStatus(participant, false, true), "disconnected", id);
    assert.equal(getCardStatus(participant, false), card, id);
    assert.equal(getCardStatus(participant, true), "出題者", id);
  }
});
