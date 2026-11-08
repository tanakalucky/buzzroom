// 表示名のルールだけを扱う。本人確認やセッションの検証には使わない。
export function validateDisplayName(
  input: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof input !== "string" || !input.trim())
    return { ok: false, error: "あなたの名前を入力してください。" };
  const name = input.trim();
  if (Array.from(name).length > 24)
    return { ok: false, error: "名前は24文字以内で入力してください。" };
  return { ok: true, name };
}
