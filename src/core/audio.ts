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

/** Disparo del balón. */
export function playKick(): void {
  tone(150, 70, 'square', 0.22);
}
