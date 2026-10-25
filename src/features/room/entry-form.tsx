"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { EntryResult } from "./types";

export function EntryForm({
  action,
  joining = false,
}: {
  action: (previous: EntryResult, form: FormData) => Promise<EntryResult>;
  joining?: boolean;
}) {
  const [result, formAction, pending] = useActionState(action, { error: "" });
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (result.error) {
      const field = result.field;
      if (field) form.current?.querySelector<HTMLInputElement>(`[name=${field}]`)?.focus();
    }
  }, [result]);
  return (
    <form action={formAction} ref={form} className="entry-fields">
      <label htmlFor="name">
        あなたの名前 <span>必須</span>
      </label>
      <input
        id="name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="クイズで使う名前"
        autoComplete="nickname"
        required
        aria-invalid={result.field === "name"}
        aria-describedby="name-help entry-error"
      />
      <p id="name-help" className="field-hint">
        24文字以内。同じ名前でも参加できます。
      </p>
      <label htmlFor="password">
        パスワード <span>必須</span>
      </label>
      <div className="password-wrap">
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete={joining ? "current-password" : "new-password"}
          required
          aria-invalid={result.field === "password"}
          aria-describedby="password-help entry-error"
        />
        <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? "隠す" : "表示"}
        </button>
      </div>
      <p id="password-help" className="field-hint">
        {joining
          ? "ホストから届いたパスワードを入力してください。"
          : "1〜128文字。URLと別に仲間へ伝えてください。"}
      </p>
      <p role="alert" id="entry-error" className="form-error">
        {result.error}
      </p>
      <button className="primary-button" disabled={pending}>
        {pending ? "確認しています…" : joining ? "入室する" : "ルームをつくる"}{" "}
        <span aria-hidden="true">→</span>
      </button>
      {joining && (
        <a href="/" className="back-link">
          キャンセルして作成画面へ
        </a>
      )}
      <p className="field-hint">
        本人確認用Cookieは発行から24時間有効です。アクセスで期限は延びません。
      </p>
    </form>
  );
}
