import * as THREE from 'three';
import type { ShotInput } from '@/game/shot-machine';
import type { Kicker } from '@/game/kicker';
import {
  traceTrajectory,
  DEFAULT_DRAG_CD,
  type BallState,
} from '@/core/ballistics';
import { speedForPower, MAX_CURVE_SPIN, MAX_TOPSPIN } from '@/core/physics';

/**
 * Solver del tiro — tarea 1.9, revertido al modelo de RETÍCULA en 1.9c.1.
 * **PUNTO DE AUDITORÍA (con 1.18).**
 *
 * Mapea (retícula, contacto, potencia) → estado inicial del balón
 * (velocidad + spin). El apuntado es una RETÍCULA en el plano del arco; la
 * dirección base se resuelve por BISECCIÓN BALÍSTICA (`solveLaunchDirection`)
 * para que el vuelo SIN spin cruce z=0 en la retícula. El contacto modula
 * comba/caída SOBRE esa trayectoria (no la elevación base):
 *   - contacto.x ⇒ comba lateral (spin sobre Y, escala con CUR).
 *   - contacto.y ⇒ caída/topspin (spin sobre X) → la pelota baja respecto a la
 *     retícula (la "maldita"); el jugador apunta un poco más alto.
 *
 * Convenciones de ejes (core/field.ts): +X derecha, +Z hacia el campo
 * (el balón viaja en -Z), +Y arriba.
 *
 * Dispersión: error gaussiano que crece con el error de potencia (1.9b.4) y se
 * reduce con PRE. Potencia perfecta ⇒ sigma=0 ⇒ vuelo determinista.
 */

const UP = new THREE.Vector3(0, 1, 0);

// --- Clasificación del contacto -------------------------------------------

export type ContactType =
  | 'chanfle_interior'
  | 'chanfle_exterior'
  | 'picada'
  | 'raso'
  | 'normal';

const SIDE_THRESHOLD = 0.45;
const VERT_THRESHOLD = 0.45;

/** Tipo de golpe según la zona del contacto y el pie del pateador. */
export function classifyContact(
  contact: { x: number; y: number },
  kicker: Kicker,
): ContactType {
  if (Math.abs(contact.x) > SIDE_THRESHOLD) {
    // El "interior" del pie está del lado del pie hábil.
    const interiorSign = kicker.foot === 'R' ? 1 : -1;
    return Math.sign(contact.x) === interiorSign
      ? 'chanfle_interior'
      : 'chanfle_exterior';
  }
  if (contact.y > VERT_THRESHOLD) return 'picada';
  if (contact.y < -VERT_THRESHOLD) return 'raso';
  return 'normal';
}

// --- Tunables de calibración (1.18) ---------------------------------------

/** Centro óptimo de potencia (barras) por tipo de golpe (recetas CLAUDE.md). */
const OPTIMAL_POWER: Record<ContactType, number> = {
  chanfle_interior: 2.75,
  chanfle_exterior: 2.5,
  picada: 2.5,
  raso: 3.0,
  normal: 2.75,
};
/** Semiancho (barras) de "potencia perfecta": dispersión cero dentro de él. */
export const PERFECT_POWER_HALF = 0.15;
/** Barras fuera del óptimo para llegar a "1.0" de error de potencia. */
const POWER_MISS_FULL_BARS = 1.5;
/** Cuánto alivia la precisión (PRE 100 ⇒ -80% de dispersión). */
const PRE_RELIEF = 0.8;
/** Dispersión angular base (rad) por unidad de error tras PRE. */
const BASE_ANGLE_SIGMA = 0.05; // ~2.9°
/** Wobble relativo de velocidad por unidad de sigma. */
const SPEED_WOBBLE = 0.4;
/** Ruido de spin (rad/s) por unidad de sigma. */
const SPIN_WOBBLE = 18;
/** Damping del topspin respecto al spin lateral máximo. */
const TOPSPIN_SCALE = 0.7;

// --- Helpers puros (auditables / testeables) ------------------------------

/** Centro óptimo de potencia (barras) para el contacto dado. */
export function optimalPowerCenter(
  contact: { x: number; y: number },
  kicker: Kicker,
): number {
  return OPTIMAL_POWER[classifyContact(contact, kicker)];
}

/** True si la potencia cayó dentro de la ventana "perfecta" del tipo de golpe. */
export function isPerfectPower(
  power: number,
  contact: { x: number; y: number },
  kicker: Kicker,
): boolean {
  return Math.abs(power - optimalPowerCenter(contact, kicker)) <= PERFECT_POWER_HALF;
}

/**
 * Apuntado BALÍSTICO (bisección): dirección de salida cuya trayectoria SIN spin
 * cruza z=0 a la altura `aim.y`, con el azimut horizontal apuntando a `aim.x`.
 * Es el modelo de apuntado del juego: balón → retícula. La comba se añade como
 * desviación intencional (spin) sobre esta base.
 */
export function solveLaunchDirection(
  ballPos: THREE.Vector3,
  aim: { x: number; y: number },
  speed: number,
  dragCd: number = DEFAULT_DRAG_CD,
  iters = 18,
  dt = 1 / 120,
): THREE.Vector3 {
  const horiz = new THREE.Vector3(aim.x - ballPos.x, 0, -ballPos.z).normalize();

  const yAtCross = (phi: number): number => {
    const dir = horiz
      .clone()
      .multiplyScalar(Math.cos(phi))
      .addScaledVector(UP, Math.sin(phi));
    const { final } = traceTrajectory(
      {
        pos: ballPos.clone(),
        vel: dir.multiplyScalar(speed),
        spin: new THREE.Vector3(),
      },
      { dragCd, dt, stop: (s) => s.pos.z <= 0 },
    );
    return final.pos.y;
  };

  // Bisección monótona: la y de cruce crece con la elevación φ.
  let lo = -0.35;
  let hi = 1.1;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (yAtCross(mid) < aim.y) lo = mid;
    else hi = mid;
  }
  const phi = (lo + hi) / 2;
  return horiz
    .clone()
    .multiplyScalar(Math.cos(phi))
    .addScaledVector(UP, Math.sin(phi));
}

/** Spin (ω, rad/s) derivado del punto de contacto y el stat CUR del pateador. */
export function contactToSpin(
  contact: { x: number; y: number },
  kicker: Kicker,
): THREE.Vector3 {
  const curveScale = kicker.cur / 100;
  return new THREE.Vector3(
    -contact.y * MAX_TOPSPIN * TOPSPIN_SCALE, // arriba ⇒ ωx<0 ⇒ caída
    contact.x * MAX_CURVE_SPIN * curveScale, // derecha ⇒ comba a la izquierda
    0,
  );
}

/**
 * Sigma de dispersión angular (rad). 0 en "potencia perfecta"; crece con
 * `|power - centroÓptimo|` y se reduce con la precisión del pateador.
 */
export function dispersionSigma(input: ShotInput, kicker: Kicker): number {
  const center = optimalPowerCenter(input.contact, kicker);
  const powerMiss = Math.max(0, Math.abs(input.power - center) - PERFECT_POWER_HALF);

  const err = powerMiss / POWER_MISS_FULL_BARS;
  const precMult = 1 - (kicker.pre / 100) * PRE_RELIEF;
  return err * precMult * BASE_ANGLE_SIGMA;
}

// --- Solver ----------------------------------------------------------------

export interface SolveContext {
  ballPos: THREE.Vector3;
  kicker: Kicker;
  /** Fuente de aleatoriedad uniforme [0,1). Inyectable para tests. */
  rng?: () => number;
}

/** Muestra una normal estándar (Box–Muller) a partir de `rng`. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Estado inicial DETERMINISTA (sin dispersión): apunta a la retícula por
 * bisección y añade el spin del contacto. Lo usan la línea de proyección y
 * `solveShot`. No muta `ctx`.
 */
export function buildInitialState(input: ShotInput, ctx: SolveContext): BallState {
  const speed = speedForPower(input.power);
  const dir = solveLaunchDirection(ctx.ballPos, input.aim, speed);
  const spin = contactToSpin(input.contact, ctx.kicker);
  return {
    pos: ctx.ballPos.clone(),
    vel: dir.multiplyScalar(speed),
    spin,
  };
}

/** Resuelve el estado inicial del balón, aplicando la dispersión del tiro. */
export function solveShot(input: ShotInput, ctx: SolveContext): BallState {
  const state = buildInitialState(input, ctx);
  const sigma = dispersionSigma(input, ctx.kicker);
  if (sigma <= 0) return state;

  const rng = ctx.rng ?? Math.random;
  let speed = state.vel.length();
  const dir = state.vel.clone().normalize();

  // Desvío angular en yaw (sobre Y) y pitch (sobre el eje lateral local).
  dir.applyAxisAngle(UP, gaussian(rng) * sigma);
  const lateral = new THREE.Vector3().crossVectors(dir, UP).normalize();
  dir.applyAxisAngle(lateral, gaussian(rng) * sigma);

  // Wobble de velocidad y spin.
  speed *= 1 + gaussian(rng) * sigma * SPEED_WOBBLE;
  state.vel.copy(dir.multiplyScalar(speed));
  state.spin.x += gaussian(rng) * sigma * SPIN_WOBBLE;
  state.spin.y += gaussian(rng) * sigma * SPIN_WOBBLE;

  return state;
}
