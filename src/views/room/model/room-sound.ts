import type { RoomSound } from "../../../entities/room";

export type SoundStatus = "off" | "starting" | "on" | "unavailable";

export function createRoomSound(
  onStatus: (status: SoundStatus) => void,
  createContext: () => AudioContext = () => new AudioContext(),
) {
  let context: AudioContext | undefined;
  let enabled = false;
  let generation = 0;
  const oscillators = new Set<OscillatorNode>();

  async function enable() {
    const requested = ++generation;
    enabled = false;
    onStatus("starting");
    try {
      context ??= createContext();
      const current = context;
      if (current.state !== "running") await current.resume();
      if (requested !== generation) return;
      if (current.state !== "running") throw new Error("Audio is unavailable");
      enabled = true;
      onStatus("on");
      play("buzz");
    } catch {
      if (requested === generation) fail();
    }
  }

  function play(sound: RoomSound) {
    if (!enabled) return;
    if (!context || context.state !== "running") {
      fail();
      return;
    }
    try {
      const notes = sound === "correct" ? [660, 880] : sound === "wrong" ? [180] : [1047];
      const duration = sound === "wrong" ? 0.28 : 0.12;
      const start = context.currentTime;
      for (const [index, frequency] of notes.entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + index * 0.14;
        oscillator.type = sound === "wrong" ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillators.add(oscillator);
        oscillator.onended = () => {
          oscillators.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(at);
        oscillator.stop(at + duration);
      }
    } catch {
      fail();
    }
  }

  function dispose() {
    ++generation;
    enabled = false;
    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        /* 終了済みの音はそのまま解放する。 */
      }
    }
    oscillators.clear();
    const previous = context;
    context = undefined;
    if (previous) void previous.close().catch(() => {});
  }

  function disable() {
    dispose();
    onStatus("off");
  }

  function fail() {
    dispose();
    onStatus("unavailable");
  }

  return { enable, disable, play, dispose };
}
