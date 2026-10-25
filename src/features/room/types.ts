import type { BuzzerState } from "../buzzer/rules";
import type { Score } from "../score/rules";
export type EntryResult = { error: string; field?: "name" | "password" };

export type Participant = Score & { id: string; name: string };
export type RoomState = {
  hostId: string;
  participants: Participant[];
  buzzer: BuzzerState;
  revision: number;
};
// 許可した公開項目だけ。パスワード・セッション・トークンのハッシュを含めない。
export type Snapshot = RoomState & { onlineIds: string[] };
export type RoomCommand =
  | { type: "buzz"; round: number }
  | { type: "judge"; round: number; targetId: string; correct: boolean }
  | { type: "reset"; round: number }
  | { type: "score"; round: number; targetId: string; correct: number; wrong: number }
  | { type: "host"; round: number; targetId: string };
export type ServerMessage =
  | { type: "snapshot"; state: Snapshot; you: string }
  | { type: "error"; code: string; message: string };
