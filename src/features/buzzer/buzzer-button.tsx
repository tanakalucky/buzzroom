"use client";

import { useEffect, useRef, useState } from "react";
import "./buzzer-button.css";

export type BuzzerStatus = "ready" | "sending" | "queued" | "answering" | "locked" | "disconnected";
const labels: Record<BuzzerStatus, [string, string]> = {
  ready: ["早押し！", "タップ、または Space キー"],
  sending: ["押下を送信しています", "サーバーでの確定を待っています"],
  queued: ["回答待ち", "押下済みです。そのままお待ちください"],
  answering: ["あなたに回答権があります", "出題者の判定をお待ちください"],
  locked: ["このターンはお休み", "正解・リセットで再び押せます"],
  disconnected: ["接続を確認しています", "復帰するまで早押しを一時停止します"],
};

// 入室済みの参加者画面だけで使う。司会・入室フォームではマウントしない。
// onPress は通信側で認可されたコマンドを送る。ローカルで順位を確定しない。
export function BuzzerButton({ status, onPress }: { status: BuzzerStatus; onPress: () => void }) {
  const dock = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(116);
  const [editing, setEditing] = useState(false);
  const ready = status === "ready";
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const measure = () => {
      const measured = Math.ceil(element.getBoundingClientRect().height);
      if (measured > 0) setHeight(measured);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const focus = () =>
      setEditing(
        !!document.activeElement?.closest("input,textarea,select,[contenteditable=true],dialog"),
      );
    const focusOut = () => queueMicrotask(focus);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focusOut);
    focus();
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focusOut);
    };
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target;
      if (
        !ready ||
        editing ||
        event.code !== "Space" ||
        event.repeat ||
        (target instanceof Element &&
          target.closest("input,textarea,select,button,a,summary,dialog,[contenteditable=true]"))
      )
        return;
      event.preventDefault();
      onPress();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [ready, editing, onPress]);
  const [title, hint] = labels[status];
  return (
    <>
      <div aria-hidden="true" style={{ height: height + 16 }} />
      <div className="buzzer-dock" ref={dock} hidden={editing}>
        <button className="fixed-buzzer" disabled={!ready} onClick={onPress}>
          <span aria-hidden="true" className="fixed-buzzer-icon">
            {ready
              ? "ϟ"
              : status === "locked"
                ? "×"
                : status === "disconnected"
                  ? "Ⅱ"
                  : status === "answering"
                    ? "●"
                    : "✓"}
          </span>
          <span>
            <strong>{title}</strong>
            <small>{hint}</small>
          </span>
        </button>
      </div>
    </>
  );
}
