"use client";
import type { Score } from "./rules";

export function ScoreEditor({
  score,
  disabled,
  onSave,
}: {
  score: Score;
  disabled: boolean;
  onSave: (score: Score) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSave({ correct: Number(data.get("correct")), wrong: Number(data.get("wrong")) });
      }}
    >
      <label>
        正解数
        <input
          name="correct"
          type="number"
          min="0"
          max={Number.MAX_SAFE_INTEGER}
          step="1"
          defaultValue={score.correct}
          required
        />
      </label>
      <label>
        不正解数
        <input
          name="wrong"
          type="number"
          min="0"
          max={Number.MAX_SAFE_INTEGER}
          step="1"
          defaultValue={score.wrong}
          required
        />
      </label>
      <button disabled={disabled}>スコアを保存</button>
    </form>
  );
}
