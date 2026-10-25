"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BuzzerButton, type BuzzerStatus } from "../buzzer/buzzer-button";
import { ScoreEditor } from "../score/score-editor";
import type { RoomCommand, ServerMessage, Snapshot } from "./types";

export function RoomScreen({ roomId }: { roomId: string }) {
  const [state, setState] = useState<Snapshot>();
  const [you, setYou] = useState("");
  const [connection, setConnection] = useState<"connecting" | "online" | "offline" | "expired">(
    "connecting",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copy, setCopy] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [url, setUrl] = useState("");
  const [successor, setSuccessor] = useState("");
  const [detailId, setDetailId] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    setUrl(window.location.origin + `/room/${roomId}`);
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    function connect() {
      if (disposed) return;
      setConnection(attempt ? "offline" : "connecting");
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/room/${roomId}/socket`,
      );
      socket.current = ws;
      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const message: ServerMessage = JSON.parse(event.data);
          sending.current = false;
          setPending(false);
          if (message.type === "snapshot") {
            attempt = 0;
            setConnection("online");
            setYou(message.you);
            setState((previous) =>
              previous && previous.revision > message.state.revision ? previous : message.state,
            );
          } else if (message.type === "error") setError(message.message);
        } catch {
          setError("状態を受信できませんでした。再接続します。");
          ws.close();
        }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        sending.current = false;
        setPending(false);
        if (event.code === 1008) {
          setConnection("expired");
          return;
        }
        setConnection("offline");
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
      ws.onerror = () => {
        if (!disposed) setConnection("offline");
      };
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.current?.close(1000);
    };
  }, [roomId]);
  const send = useCallback(
    (command: RoomCommand) => {
      if (
        connection !== "online" ||
        socket.current?.readyState !== WebSocket.OPEN ||
        sending.current
      )
        return;
      sending.current = true;
      setPending(true);
      setError("");
      try {
        socket.current.send(JSON.stringify(command));
      } catch {
        sending.current = false;
        setPending(false);
        setError("送信できませんでした。接続を確認してください。");
      }
    },
    [connection],
  );
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("ルームURLをコピーしました。");
      setCopyFailed(false);
    } catch {
      setCopy("コピーできませんでした。URLを選択してコピーしてください。");
      setCopyFailed(true);
    }
  }
  const host = state?.participants.find((p) => p.id === state.hostId);
  const detail = state?.participants.find((p) => p.id === detailId);
  const isHost = state?.hostId === you;
  const active = state?.participants.find((p) => p.id === state.buzzer.queue[0]);
  const answerers = state?.participants.filter((p) => p.id !== state.hostId) ?? [];
  const allLocked =
    answerers.length > 0 && answerers.every((p) => state?.buzzer.blocked.includes(p.id));
  const online = connection === "online";
  const buzzerStatus: BuzzerStatus = !online
    ? "disconnected"
    : pending
      ? "sending"
      : state?.buzzer.blocked.includes(you)
        ? "locked"
        : state?.buzzer.queue[0] === you
          ? "answering"
          : state?.buzzer.order.includes(you)
            ? "queued"
            : "ready";
  const press = useCallback(() => {
    if (state) send({ type: "buzz", round: state.buzzer.round });
  }, [state, send]);
  return (
    <main className="page room-page">
      <section className="room-shell">
        <header className="room-header">
          <div>
            <p>招待制のルーム　{state && `ROUND ${String(state.buzzer.round).padStart(2, "0")}`}</p>
            <h1>早押しルーム</h1>
          </div>
          <div className="room-header-right">
            <span className="host-name">
              出題者 <strong title={host?.name}>{host?.name ?? "確認中"}</strong>
            </span>
            <button onClick={copyUrl}>URLをコピー</button>
          </div>
        </header>
        {copy && (
          <p className="copy-status" role="status">
            {copy}
          </p>
        )}
        {copyFailed && (
          <div className="copy-fallback">
            <input
              ref={urlInput}
              aria-label="ルームURL"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => {
                urlInput.current?.focus();
                urlInput.current?.select();
              }}
            >
              URLを選択
            </button>
          </div>
        )}
        {!online && (
          <div className="connection-banner" role="status">
            <strong>
              {connection === "expired"
                ? "参加の有効期限が切れました"
                : connection === "connecting"
                  ? "ルームに接続しています"
                  : "再接続しています"}
            </strong>
            <p>
              {connection === "expired"
                ? "名前とパスワードで、もう一度入室してください。"
                : "状態を確認するまで、早押し・採点を一時停止します。"}{" "}
              <a href={`/room/${roomId}`}>
                {connection === "expired" ? "入室画面へ" : "再読み込み"}
              </a>
            </p>
          </div>
        )}
        {error && (
          <p className="form-error room-error" role="alert">
            {error}
          </p>
        )}
        {state && (
          <>
            <div className="room-content">
              <div className="game-main">
                <div className="section-heading">
                  <h2>
                    メンバー <span>{state.participants.length}人</span>
                  </h2>
                  <small>数字＝押下順 · ●＝回答権 · 名前で詳細</small>
                </div>
                <div className="round-status" role="status">
                  <span>{active ? "回答中" : allLocked ? "リセット待ち" : "早押し受付中"}</span>
                  <strong>
                    {active
                      ? `${active.name}さんに回答権があります`
                      : state.participants.length < 2
                        ? "仲間の参加を待っています"
                        : allLocked
                          ? "出題者のリセットを待っています"
                          : "わかったら、早押し！"}
                  </strong>
                </div>
                {!state.onlineIds.includes(state.hostId) && (
                  <p className="host-wait" role="status">
                    出題者は切断中です。本人の復帰を待っています。
                  </p>
                )}
                <div className="participant-grid">
                  {state.participants.map((p) => {
                    const order = state.buzzer.order.indexOf(p.id);
                    const blocked = state.buzzer.blocked.includes(p.id);
                    const floor = state.buzzer.queue[0] === p.id;
                    const connected = state.onlineIds.includes(p.id);
                    return (
                      <article
                        key={p.id}
                        aria-label={`${p.name}のカード`}
                        className={`participant-card ${floor ? "has-floor" : ""} ${blocked ? "is-locked" : ""}`}
                      >
                        {order >= 0 && (
                          <span className="order-badge" aria-label={`押下順 ${order + 1}番`}>
                            {order + 1}
                          </span>
                        )}
                        <h3>
                          <span className="avatar" aria-hidden="true">
                            {Array.from(p.name)[0]}
                          </span>
                          <button
                            title={p.name}
                            aria-label={`${p.name}の名前を全文表示`}
                            onClick={() => {
                              setDetailId(p.id);
                              dialog.current?.showModal();
                            }}
                          >
                            {p.name}
                          </button>
                        </h3>
                        <p className="participant-status">
                          {p.id === state.hostId
                            ? "出題者"
                            : blocked
                              ? "× 誤答ロック"
                              : floor
                                ? "● 回答権あり"
                                : order >= 0
                                  ? "回答待ち"
                                  : "◎ 受付中"}
                          {!connected && " · 切断"}
                        </p>
                        <div className="card-scores">
                          <span>
                            ○ 正解 <strong>{p.correct}</strong>
                          </span>
                          <span>
                            × 不正解 <strong>{p.wrong}</strong>
                          </span>
                        </div>
                        {p.id === you && <small className="self-label">あなた</small>}
                      </article>
                    );
                  })}
                </div>
                <p className="grid-hint">
                  押下順は誤答しても変わりません。正解・リセットで次のターンへ進みます。
                </p>
              </div>
              <aside className="room-actions">
                <h2>{isHost ? "出題者の操作" : "あなたの早押し"}</h2>
                {isHost ? (
                  <>
                    <p className="current-answer">
                      回答者：<strong>{active?.name ?? "回答待ち"}</strong>
                    </p>
                    <div className="judge-row">
                      <button
                        className="correct"
                        disabled={!online || pending || !active}
                        onClick={() =>
                          send({
                            type: "judge",
                            round: state.buzzer.round,
                            targetId: active!.id,
                            correct: true,
                          })
                        }
                      >
                        ○ 正解
                      </button>
                      <button
                        disabled={!online || pending || !active}
                        onClick={() =>
                          send({
                            type: "judge",
                            round: state.buzzer.round,
                            targetId: active!.id,
                            correct: false,
                          })
                        }
                      >
                        × 不正解
                      </button>
                      <button
                        disabled={!online || pending}
                        onClick={() => send({ type: "reset", round: state.buzzer.round })}
                      >
                        ↻ リセット
                      </button>
                    </div>
                    <p className="control-hint">
                      不正解は次の人へ。正解・リセットで全員が再び押せます。
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        send({ type: "host", round: state.buzzer.round, targetId: successor });
                        setSuccessor("");
                      }}
                    >
                      <label htmlFor="successor">出題者を交代</label>
                      <select
                        id="successor"
                        value={successor}
                        disabled={!online || pending}
                        onChange={(e) => setSuccessor(e.target.value)}
                      >
                        <option value="">次の出題者を選択</option>
                        {state.participants
                          .filter((p) => p.id !== state.hostId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                      <button disabled={!online || pending || !successor}>交代する</button>
                    </form>
                    <p className="control-hint">名前の詳細から正解・不正解の数を編集できます。</p>
                  </>
                ) : (
                  <>
                    <p>「{state.participants.find((p) => p.id === you)?.name}」として参加中</p>
                    <p className="control-hint">
                      画面下部の黄色いボタンで早押し。問題は出題者が読み上げます。
                    </p>
                  </>
                )}
              </aside>
            </div>
            <footer className="room-footer">
              {online ? "● 接続中" : "Ⅱ 接続待ち"} · 早押しはサーバーで受信した順に確定します。
            </footer>
            {!isHost && <BuzzerButton status={buzzerStatus} onPress={press} />}
          </>
        )}
      </section>
      <dialog ref={dialog} className="name-dialog" aria-labelledby="detail-title">
        <h2 id="detail-title">名前とスコア</h2>
        {detail && (
          <>
            <p className="full-name">{detail.name}</p>
            <p>
              ○ 正解 {detail.correct}　× 不正解 {detail.wrong}
            </p>
            {isHost && detail.id !== state?.hostId && (
              <ScoreEditor
                key={`${detail.id}:${detail.correct}:${detail.wrong}`}
                score={detail}
                disabled={!online || pending}
                onSave={(score) => {
                  send({
                    type: "score",
                    round: state!.buzzer.round,
                    targetId: detail.id,
                    ...score,
                  });
                }}
              />
            )}
          </>
        )}
        <form method="dialog">
          <button>閉じる</button>
        </form>
      </dialog>
    </main>
  );
}
