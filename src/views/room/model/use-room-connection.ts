"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomCommand, RoomSound, ServerMessage, Snapshot } from "../../../entities/room";

export function useRoomConnection(roomId: string, onSound?: (sound: RoomSound) => void) {
  const soundListener = useRef(onSound);
  soundListener.current = onSound;
  const [state, setState] = useState<Snapshot>();
  const [you, setYou] = useState("");
  const [connection, setConnection] = useState<"connecting" | "online" | "offline" | "expired">(
    "connecting",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    function connect() {
      if (disposed) return;
      setConnection(attempt ? "offline" : "connecting");
      let initialRevision: number | undefined;
      let latestRevision = -1;
      let soundRevision = -1;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/room/${roomId}/socket`,
      );
      socket.current = ws;
      ws.onmessage = (event) => {
        if (disposed || socket.current !== ws) return;
        try {
          const message: ServerMessage = JSON.parse(event.data);
          sending.current = false;
          setPending(false);
          if (message.type === "snapshot") {
            const revision = message.state.revision;
            // 最初のsnapshotは復元の基準。音の履歴は持たず、接続中の新しい受理だけ通知する。
            initialRevision ??= revision;
            if (
              message.sound &&
              revision > initialRevision &&
              revision >= latestRevision &&
              revision > soundRevision
            ) {
              soundRevision = revision;
              try {
                soundListener.current?.(message.sound);
              } catch {
                // 音声の失敗でゲームの同期を止めない。
              }
            }
            latestRevision = Math.max(latestRevision, revision);
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

  return { state, you, connection, pending, error, send };
}
