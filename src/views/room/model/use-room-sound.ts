"use client";
import { useEffect, useRef, useState } from "react";
import { createRoomSound, type SoundStatus } from "./room-sound";

export function useRoomSound() {
  const [status, setStatus] = useState<SoundStatus>("off");
  const player = useRef<ReturnType<typeof createRoomSound> | null>(null);
  player.current ??= createRoomSound(setStatus);
  const current = player.current;

  useEffect(() => () => current.dispose(), [current]);

  return { status, enable: current.enable, disable: current.disable, play: current.play };
}
