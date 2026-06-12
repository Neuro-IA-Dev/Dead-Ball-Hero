/**
 * Audio sintetizado (Web Audio, sin assets) — base de 1.8, ampliado en el pase
 * de "Ejecución FC26 v1" (silbato, golpe con cuerpo, whoosh del balón, red,
 * reacción de la multitud). Todo CC0/sintetizado, < unos pocos KB de código.
 *
 * Diseño: un único AudioContext perezoso (respeta la política de autoplay: solo
 * suena tras el primer gesto del usuario) + un master gain para mutear/volumen.
 * Las voces son cortas y baratas; nada se mantiene vivo entre tiros.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function out(): GainNode {
  ac();
  return master!;
}

/** True si el contexto ya está activo (tras un gesto del usuario). */
export function audioReady(): boolean {
  return ctx != null && ctx.state === 'running';
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.9;
}

/** Buffer de ruido blanco reutilizable (1 s) para texturas percusivas. */
function noise(): AudioBuffer {
  const a = ac();
  if (!noiseBuf || noiseBuf.sampleRate !== a.sampleRate) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function env(g: GainNode, now: number, peak: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(peak, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
}

function tone(
  freq: number,
  durMs: number,
  type: OscillatorType,
  gain = 0.18,
  delayMs = 0,
  endFreq?: number,
): void {
  const a = ac();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  const now = a.currentTime + delayMs / 1000;
  const dur = durMs / 1000;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + dur);
  env(g, now, gain, 0.005, dur);
  osc.connect(g).connect(out());
  osc.start(now);
  osc.stop(now + dur);
}

/** Ráfaga de ruido filtrado (transitorios percusivos: golpe, red, whoosh). */
function noiseBurst(
  opts: {
    durMs: number;
    type: BiquadFilterType;
    freq: number;
    endFreq?: number;
    q?: number;
    gain?: number;
    attack?: number;
    delayMs?: number;
  },
): void {
  const a = ac();
  const src = a.createBufferSource();
  src.buffer = noise();
  const filt = a.createBiquadFilter();
  filt.type = opts.type;
  const now = a.currentTime + (opts.delayMs ?? 0) / 1000;
  const dur = opts.durMs / 1000;
  filt.frequency.setValueAtTime(opts.freq, now);
  if (opts.endFreq != null) {
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), now + dur);
  }
  filt.Q.value = opts.q ?? 0.7;
  const g = a.createGain();
  env(g, now, opts.gain ?? 0.2, opts.attack ?? 0.004, dur);
  src.connect(filt).connect(g).connect(out());
  src.start(now);
  src.stop(now + dur + 0.05);
}

/** Silbato del árbitro: dos blasts agudos con trino (autoriza el tiro). */
export function playWhistle(): void {
  const a = ac();
  for (const d of [0, 200]) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'triangle';
    const now = a.currentTime + d / 1000;
    const dur = 0.16;
    // Trino: modula la frecuencia rápido alrededor de ~2500 Hz.
    osc.frequency.setValueAtTime(2480, now);
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 28;
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain).connect(osc.frequency);
    env(g, now, 0.1, 0.01, dur);
    osc.connect(g).connect(out());
    osc.start(now);
    osc.stop(now + dur);
    lfo.start(now);
    lfo.stop(now + dur);
  }
  // Aire del silbato.
  noiseBurst({ durMs: 120, type: 'bandpass', freq: 2600, q: 2, gain: 0.05 });
}

/** Golpe al balón: transitorio de ruido (cuero) + cuerpo grave (thump). */
export function playKick(power = 3): void {
  const p = Math.max(1, Math.min(5, power));
  // "Thwack" de cuero.
  noiseBurst({ durMs: 60, type: 'highpass', freq: 1400, gain: 0.32, attack: 0.001 });
  // Cuerpo: el pitch del thump sube con la potencia.
  tone(70 + p * 20, 110, 'sine', 0.5, 0, 48 + p * 10);
  // Click de contacto.
  tone(180 + p * 40, 35, 'square', 0.12);
}

/** Whoosh del balón en vuelo: silba más agudo cuanto más rápido sale. */
export function playWhoosh(speed = 28): void {
  const s = Math.max(14, Math.min(40, speed));
  const dur = 380 + s * 8; // más rápido ⇒ pasa más tiempo "silbando"
  const base = 220 + s * 14;
  noiseBurst({
    durMs: dur,
    type: 'bandpass',
    freq: base,
    endFreq: base * 0.45,
    q: 1.4,
    gain: 0.06 + (s - 14) * 0.004,
    attack: 0.05,
    delayMs: 30,
  });
}

/** Red: swish corto y seco al entrar el balón. */
export function playNet(): void {
  noiseBurst({ durMs: 220, type: 'highpass', freq: 3200, endFreq: 900, gain: 0.18, attack: 0.002 });
  noiseBurst({ durMs: 140, type: 'bandpass', freq: 700, q: 0.6, gain: 0.1, delayMs: 20 });
}

/** Palo/travesaño: "clank" metálico con parciales inarmónicos. */
export function playPost(): void {
  tone(1500, 70, 'triangle', 0.24);
  tone(2010, 110, 'triangle', 0.16, 12);
  tone(2790, 90, 'sine', 0.1, 8);
}

/** Potencia perfecta: arpegio ascendente "dorado". */
export function playPerfect(): void {
  tone(660, 90, 'triangle', 0.16, 0);
  tone(990, 120, 'triangle', 0.18, 70);
  tone(1320, 150, 'triangle', 0.14, 150);
}

/** Explosión de la multitud al gol: ruido grave que crece + voces agudas. */
export function playCrowd(): void {
  const a = ac();
  const dur = 1.5;
  const src = a.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  const now = a.currentTime;
  lp.frequency.setValueAtTime(300, now);
  lp.frequency.linearRampToValueAtTime(1600, now + 0.25);
  lp.frequency.linearRampToValueAtTime(700, now + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.34, now + 0.12);
  g.gain.setValueAtTime(0.34, now + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(lp).connect(g).connect(out());
  src.start(now);
  src.stop(now + dur + 0.05);
  // Capa aguda de "voces".
  noiseBurst({ durMs: 900, type: 'bandpass', freq: 1500, q: 0.5, gain: 0.08, attack: 0.1 });
}

/** Murmullo de decepción "ohhh" al fallar (palo/afuera/atajada). */
export function playGroan(): void {
  const a = ac();
  const dur = 0.7;
  const src = a.createBufferSource();
  src.buffer = noise();
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  const now = a.currentTime;
  lp.frequency.setValueAtTime(900, now);
  lp.frequency.linearRampToValueAtTime(360, now + dur);
  const g = a.createGain();
  env(g, now, 0.2, 0.1, dur);
  src.connect(lp).connect(g).connect(out());
  src.start(now);
  src.stop(now + dur + 0.05);
  tone(170, dur * 1000, 'sine', 0.08, 0, 120);
}
