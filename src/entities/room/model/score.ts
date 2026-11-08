export type Score = { correct: number; wrong: number };

export function isScore(value: Score): boolean {
  return [value.correct, value.wrong].every((n) => Number.isSafeInteger(n) && n >= 0);
}

export function editScore(previous: Score, next: Score): Score {
  return isScore(next) ? { ...next } : previous;
}

export function awardAnswer(previous: Score, correct: boolean): Score {
  return editScore(previous, {
    correct: previous.correct + Number(correct),
    wrong: previous.wrong + Number(!correct),
  });
}
