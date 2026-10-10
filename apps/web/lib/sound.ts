export type SoundName = "move" | "capture" | "check" | "end" | "start" | "illegal";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(
  ac: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType,
  gain: number,
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Synthesized UI sounds; silent when disabled or when WebAudio is missing. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  switch (name) {
    case "move":
      beep(ac, 520, t, 0.07, "triangle", 0.25);
      break;
    case "capture":
      beep(ac, 300, t, 0.09, "triangle", 0.3);
      beep(ac, 180, t + 0.02, 0.1, "sine", 0.25);
      break;
    case "check":
      beep(ac, 740, t, 0.08, "square", 0.12);
      beep(ac, 740, t + 0.1, 0.08, "square", 0.12);
      break;
    case "start":
      beep(ac, 440, t, 0.09, "triangle", 0.25);
      beep(ac, 660, t + 0.09, 0.12, "triangle", 0.25);
      break;
    case "end":
      beep(ac, 523, t, 0.12, "triangle", 0.25);
      beep(ac, 392, t + 0.12, 0.12, "triangle", 0.25);
      beep(ac, 330, t + 0.24, 0.18, "triangle", 0.25);
      break;
    case "illegal":
      beep(ac, 140, t, 0.15, "sawtooth", 0.15);
      break;
  }
}
