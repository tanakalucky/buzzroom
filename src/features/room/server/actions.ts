"use server";
import { roomStub } from "./binding";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateDisplayName } from "../input";
import type { EntryResult } from "../types";
import {
  cookieName,
  cookiePath,
  hashToken,
  isRoomId,
  passwordValid,
  randomToken,
} from "./security";

async function actionOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (!origin || new URL(origin).host !== host) throw Error("Origin mismatch");
  const url = new URL(origin);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw Error("HTTPS required");
  return url;
}
function inputs(data: FormData): EntryResult | { name: string; password: string } {
  const name = validateDisplayName(data.get("name"));
  if (!name.ok) return { error: name.error, field: "name" as const };
  const password = data.get("password");
  if (!passwordValid(password))
    return { error: "パスワードを1〜128文字で入力してください。", field: "password" as const };
  return { name: name.name, password };
}
async function setSession(roomId: string, token: string, expiresAt: number, secure: boolean) {
  (await cookies()).set(cookieName(roomId), token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: cookiePath(roomId),
    expires: new Date(expiresAt),
  });
}
export async function createRoom(_previous: EntryResult, data: FormData): Promise<EntryResult> {
  const input = inputs(data);
  if ("error" in input) return input;
  let roomId: string;
  try {
    const origin = await actionOrigin();
    roomId = crypto.randomUUID();
    const token = randomToken();
    const result = await roomStub(roomId).create(
      input.name,
      input.password,
      await hashToken(token),
    );
    if (!result.ok) return { error: result.error };
    await setSession(roomId, token, result.expiresAt, origin.protocol === "https:");
  } catch {
    return { error: "作成できませんでした。接続を確認し、もう一度お試しください。" };
  }
  redirect(cookiePath(roomId));
}
export async function joinRoom(
  roomId: string,
  _previous: EntryResult,
  data: FormData,
): Promise<EntryResult> {
  const input = inputs(data);
  if ("error" in input) return input;
  try {
    if (!isRoomId(roomId)) return { error: "ルームが見つかりません。" };
    const origin = await actionOrigin();
    const stub = roomStub(roomId);
    const existing = (await cookies()).get(cookieName(roomId))?.value;
    // 同じ資格情報が有効なら、名前変更・期限延長・重複参加を行わず復帰する。
    const resumed = existing ? await stub.inspectSession(await hashToken(existing)) : null;
    if (!resumed) {
      const token = randomToken();
      const result = await stub.join(input.name, input.password, await hashToken(token));
      if (!result.ok) return { error: result.error, field: "password" };
      await setSession(roomId, token, result.expiresAt, origin.protocol === "https:");
    }
  } catch {
    return { error: "入室できませんでした。接続を確認し、再試行してください。" };
  }
  redirect(cookiePath(roomId));
}
