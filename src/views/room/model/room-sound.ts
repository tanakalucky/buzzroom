import type { RoomSound } from "../../../entities/room";

export type SoundStatus = "off" | "starting" | "on" | "unavailable";

export function createRoomSound(
  onStatus: (status: SoundStatus) => void,
  createContext: () => AudioContext = () => new AudioContext(),
  fetchAudio: typeof fetch = (input, init) => fetch(input, init),
) {
  let context: AudioContext | undefined;
  let loading: AbortController | undefined;
  let buffers = new Map<RoomSound, AudioBuffer>();
  let enabled = false;
  let generation = 0;
  const sources = new Set<AudioBufferSourceNode>();

  async function enable() {
    if (enabled || loading) return;
    const requested = ++generation;
    const controller = new AbortController();
    loading = controller;
    onStatus("starting");
    try {
      const current = createContext();
      context = current;
      // ユーザー操作中にresumeを呼ぶ。通信完了を待ってからでは音声制限に掛かる。
      const resume = current.state === "running" ? Promise.resolve() : current.resume();
      const [, decoded] = await Promise.all([resume, loadBuffers(current, controller.signal)]);
      if (requested !== generation) return;
      if (current.state !== "running") throw new Error("Audio is unavailable");
      buffers = decoded;
      loading = undefined;
      enabled = true;
      onStatus("on");
      play("buzz");
    } catch {
      if (requested === generation) fail();
    }
  }

  function play(sound: RoomSound) {
    if (!enabled) return;
    const buffer = buffers.get(sound);
    if (!context || context.state !== "running" || !buffer) {
      fail();
      return;
    }
    try {
      const source = context.createBufferSource();
      sources.add(source);
      source.onended = () => release(source);
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
    } catch {
      fail();
    }
  }

  function disable() {
    dispose();
    onStatus("off");
  }

  function fail() {
    dispose();
    onStatus("unavailable");
  }

  function dispose() {
    ++generation;
    enabled = false;
    loading?.abort();
    loading = undefined;
    buffers.clear();
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* 開始前に失敗した音も接続を解放する。 */
      }
      release(source);
    }
    const previous = context;
    context = undefined;
    if (previous) void previous.close().catch(() => {});
  }

  function release(source: AudioBufferSourceNode) {
    sources.delete(source);
    source.onended = null;
    source.disconnect();
  }

  async function loadBuffers(current: AudioContext, signal: AbortSignal) {
    const entries = await Promise.all(
      (Object.entries(SOUND_FILES) as [RoomSound, string][]).map(async ([sound, url]) => {
        const response = await fetchAudio(url, {
          signal,
          mode: "same-origin",
          redirect: "error",
        });
        if (!response.ok) throw new Error("Sound file is unavailable");
        const bytes = await response.arrayBuffer();
        signal.throwIfAborted();
        const buffer = await current.decodeAudioData(bytes);
        signal.throwIfAborted();
        return [sound, buffer] as const;
      }),
    );
    return new Map(entries);
  }

  return { enable, disable, play, dispose };
}

const SOUND_FILES: Record<RoomSound, string> = {
  buzz: "/sounds/otologic/quiz-button02-1.mp3",
  correct: "/sounds/otologic/quiz-pingpong02-1.mp3",
  wrong: "/sounds/otologic/quiz-buzzer02-1.mp3",
};
