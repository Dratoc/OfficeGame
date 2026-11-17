/** Tiny synthesized sound effects, so the fight needs no audio files. */
let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(type: OscillatorType, from: number, to: number, seconds: number, volume: number, delay = 0) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + seconds);
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + seconds);
}

function hiss(freq: number, seconds: number, volume: number, sweepTo?: number) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const src = noise(c, seconds);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + seconds);
  const g = c.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  unlock() {
    audio();
  },
  setMuted(m: boolean) {
    muted = m;
  },
  isMuted: () => muted,
  hit() {
    tone('square', 180, 60, 0.12, 0.18);
    hiss(1200, 0.1, 0.35);
  },
  block() {
    tone('triangle', 1400, 900, 0.18, 0.15);
    tone('sine', 2100, 1800, 0.12, 0.08);
  },
  swing() {
    hiss(500, 0.15, 0.15, 2500);
  },
  whoosh() {
    hiss(300, 0.25, 0.2, 1800);
  },
  ko() {
    tone('sawtooth', 440, 80, 0.7, 0.15);
    tone('square', 220, 50, 0.8, 0.1, 0.1);
  },
  go() {
    tone('square', 523, 523, 0.12, 0.1);
    tone('square', 784, 784, 0.25, 0.1, 0.12);
  },
  beep() {
    tone('square', 440, 440, 0.1, 0.08);
  },
};
