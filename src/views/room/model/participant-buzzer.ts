import type { BuzzerState } from "../../../entities/room";
import type { BuzzerStatus } from "../../../features/buzz";

type ParticipantBuzzer = {
  pressOrder: number | null;
  blocked: boolean;
  hasFloor: boolean;
  queued: boolean;
};

export function getParticipantBuzzer(buzzer: BuzzerState, id: string): ParticipantBuzzer {
  const orderIndex = buzzer.order.indexOf(id);
  const queueIndex = buzzer.queue.indexOf(id);

  return {
    pressOrder: orderIndex < 0 ? null : orderIndex + 1,
    blocked: buzzer.blocked.includes(id),
    hasFloor: queueIndex === 0,
    queued: queueIndex >= 0,
  };
}

export function getButtonStatus(
  participant: ParticipantBuzzer,
  online: boolean,
  pending: boolean,
): BuzzerStatus {
  if (!online) return "disconnected";
  if (pending) return "sending";
  if (participant.blocked) return "locked";
  if (participant.hasFloor) return "answering";
  if (participant.queued) return "queued";
  return participant.pressOrder === null ? "ready" : "pressed";
}

export function getCardStatus(participant: ParticipantBuzzer, isHost: boolean): string {
  if (isHost) return "出題者";
  if (participant.blocked) return "× 誤答ロック";
  if (participant.hasFloor) return "● 回答権あり";
  return participant.queued ? "回答待ち" : "◎ 受付中";
}
