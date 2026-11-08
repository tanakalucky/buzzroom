import type { RoomSound } from "../../../entities/room";

export type SoundStatus = "off" | "starting" | "on" | "unavailable";

export function createRoomSound(
  onStatus: (status: SoundStatus) => void,
  createContext: () => AudioContext = () => new AudioContext(),
) {
  let context: AudioContext | undefined;
  let enabled = false;
  let generation = 0;
  const oscillators = new Map<OscillatorNode, GainNode>();

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
      const start = context.currentTime;
      for (const note of SOUND_NOTES[sound]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillators.set(oscillator, gain);
        oscillator.onended = () => release(oscillator, gain);
        const at = start + note.offset;
        oscillator.type = note.wave;
        oscillator.frequency.value = note.frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(note.peak, at + note.attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.duration - 0.005);
        gain.gain.linearRampToValueAtTime(0, at + note.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + note.duration);
      }
    } catch {
      fail();
    }
  }

  function dispose() {
    ++generation;
    enabled = false;
    for (const [oscillator, gain] of oscillators) {
      try {
        oscillator.stop();
      } catch {
        /* 終了済みの音はそのまま解放する。 */
      }
      release(oscillator, gain);
    }
    oscillators.clear();
    const previous = context;
    context = undefined;
    if (previous) void previous.close().catch(() => {});
  }

  function release(oscillator: OscillatorNode, gain: GainNode) {
    oscillators.delete(oscillator);
    oscillator.onended = null;
    oscillator.disconnect();
    gain.disconnect();
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

// 波形・音域・リズムを分け、音程だけに頼らず受理と判定を聞き分ける。
// squareは倍音が強いため、チャイムより小さいピークに抑える。
const SOUND_NOTES: Record<RoomSound, readonly SoundNote[]> = {
  buzz: [{ wave: "triangle", frequency: 880, offset: 0, duration: 0.09, attack: 0.004, peak: 0.1 }],
  correct: [
    { wave: "sine", frequency: 659.25, offset: 0, duration: 0.18, attack: 0.008, peak: 0.09 },
    { wave: "sine", frequency: 987.77, offset: 0.1, duration: 0.18, attack: 0.008, peak: 0.09 },
    { wave: "sine", frequency: 1318.51, offset: 0.2, duration: 0.24, attack: 0.008, peak: 0.09 },
  ],
  wrong: [
    { wave: "square", frequency: 146.83, offset: 0, duration: 0.12, attack: 0.008, peak: 0.035 },
    { wave: "square", frequency: 130.81, offset: 0.16, duration: 0.12, attack: 0.008, peak: 0.035 },
  ],
};

type SoundNote = {
  wave: OscillatorType;
  frequency: number;
  offset: number;
  duration: number;
  attack: number;
  peak: number;
};
