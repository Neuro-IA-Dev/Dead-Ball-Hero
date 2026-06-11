/**
 * Audio mínimo sintetizado (Web Audio) — soporte para el feedback de 1.8.
 * Los sonidos completos (golpe, palo, red, multitud) son la tarea 1.17;
 * aquí sólo lo justo para el timing y el disparo. CC0 / sintetizado.
 */
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  durMs: number,
  type: OscillatorType,
  gain = 0.18,
  delayMs = 0,
): void {
  const a = ac();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Envolvente corta para evitar clicks.
  const now = a.currentTime + delayMs / 1000;
  const dur = durMs / 1000;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g).connect(a.destination);
  osc.start(now);
  osc.stop(now + dur);
}

/** Potencia perfecta: pequeño arpegio ascendente "dorado". */
export function playPerfect(): void {
  tone(660, 90, 'triangle', 0.16, 0);
  tone(990, 130, 'triangle', 0.18, 70);
}

/** Golpe al balón. El pitch sube con la potencia [1..5]. */
export function playKick(power = 3): void {
  tone(110 + power * 28, 70, 'square', 0.22);
}

/** Palo/travesaño: "clank" metálico seco. */
export function playPost(): void {
  tone(1500, 55, 'triangle', 0.2);
  tone(2200, 90, 'triangle', 0.13, 18);
}

/** Rugido de multitud: ráfaga de ruido filtrado con envolvente. */
export function playCrowd(): void {
  const a = ac();
  const dur = 0.7;
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src = a.createBufferSource();
  src.buffer = buffer;
  const filt = a.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 900;
  filt.Q.value = 0.7;
  const g = a.createGain();
  const now = a.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.2, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filt).connect(g).connect(a.destination);
  src.start(now);
  src.stop(now + dur);
}
