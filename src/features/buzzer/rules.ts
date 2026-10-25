// RoomDO が受信した順に同期的に呼び出す。時刻は引数にも判定にも使わない。
export type BuzzerState = {
  round: number;
  order: string[];
  queue: string[];
  blocked: string[];
};

export function initialBuzzer(): BuzzerState {
  return { round: 1, order: [], queue: [], blocked: [] };
}

export function pressBuzzer(
  state: BuzzerState,
  participantId: string,
  eligibleIds: readonly string[],
): BuzzerState {
  // eligibleIds はサーバで認証した参加者一覧（司会を除く）。名前ではない。
  if (
    !eligibleIds.includes(participantId) ||
    state.order.includes(participantId) ||
    state.blocked.includes(participantId)
  )
    return state;
  return {
    ...state,
    order: [...state.order, participantId],
    queue: [...state.queue, participantId],
  };
}

export function resetRound(state: BuzzerState): BuzzerState {
  return { round: state.round + 1, order: [], queue: [], blocked: [] };
}

// 認可・永続化・得点の同時更新は呼び出し元の RoomDO が担当する。
export function judgeAnswer(state: BuzzerState, correct: boolean): BuzzerState {
  const participantId = state.queue[0];
  if (participantId === undefined) return state;
  return correct
    ? resetRound(state)
    : {
        ...state,
        queue: state.queue.slice(1),
        blocked: [...state.blocked, participantId],
      };
}
