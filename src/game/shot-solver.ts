import * as THREE from 'three';
import type { ShotInput } from '@/game/shot-machine';
import type { Kicker } from '@/game/kicker';
import {
  traceTrajectory,
  DEFAULT_DRAG_CD,
  type BallState,
} from '@/core/ballistics';
import {
  speedForPower,
  MAX_CURVE_SPIN,
  MAX_TOPSPIN,
} from '@/core/physics';

/**
 * Solver del tiro — tarea 1.9. **PUNTO DE AUDITORÍA (con 1.18).**
 *
 * Mapea (apuntado, contacto, potencia, timing) → estado inicial del balón
 * (velocidad + spin). Es donde se decide el "feeling": una receta bien
 * ejecutada debe convertir de forma consistente, y errar el timing/potencia
 * debe castigar de forma justa (no aleatoria cuando el tiro es perfecto).
 *
 * Convenciones de ejes (ver core/field.ts): +X derecha, +Z hacia el campo
 * (el balón viaja en -Z), +Y arriba.
 *
 * Spin:
 *   - Comba lateral: spin sobre el eje Y. Con v en -Z, ω=+Y desvía hacia -X.
 *     → contacto.x>0 (golpe en el lado derecho del balón) ⇒ comba hacia la
 *       izquierda (inswinger). Escala con el stat CUR del pateador.
 *   - Caída/topspin: spin sobre el eje X. Para que el balón "pique y baje"
 *     en vuelo (-Z) hace falta ωx<0. → contacto.y>0 (golpe arriba) ⇒ caída.
 *
 * Dispersión (error gaussiano): crece al salir de la ventana verde y del
 * rango óptimo de potencia, y se reduce con la precisión (PRE). Si el tiro es
 * verde y la potencia es óptima ⇒ sigma=0 ⇒ vuelo determinista (sin ruido).
 *
 * Todos los números mágicos están nombrados abajo y son los candidatos de
 * calibración de 1.18.
 */

// --- Tunables de calibración (1.18) ---------------------------------------

/** Rango óptimo de potencia (barras): el sweet spot de la curva clásica. */
export const POWER_OPTIMAL_LO = 2.5;
export const POWER_OPTIMAL_HI = 3.5;

/** Damping del topspin respecto al spin lateral máximo. */
const TOPSPIN_SCALE = 0.7;

/** @deprecated semiancho del extinto timing verde. Se elimina en 1.9b.4. */
const TIMING_GREEN_HALF_MS = 80;
/** ms de timing más allá del verde para llegar a "1.0" de error de timing. */
const TIMING_MISS_FULL_MS = 220;
/** barras fuera del óptimo para llegar a "1.0" de error de potencia. */
const POWER_MISS_FULL_BARS = 1.5;
/** Cuánto alivia la precisión (PRE 100 ⇒ -80% de dispersión). */
const PRE_RELIEF = 0.8;
/** Dispersión angular base (rad) por unidad de error tras PRE. */
const BASE_ANGLE_SIGMA = 0.05; // ~2.9°
/** Wobble relativo de velocidad por unidad de sigma. */
const SPEED_WOBBLE = 0.4;
/** Ruido de spin (rad/s) por unidad de sigma. */
const SPIN_WOBBLE = 18;

// --- Helpers puros (auditables / testeables) ------------------------------

/** Dirección recta (geométrica) del balón al punto apuntado. */
export function aimDirection(
  ballPos: THREE.Vector3,
  aim: { x: number; y: number },
): THREE.Vector3 {
  return new THREE.Vector3(aim.x, aim.y, 0).sub(ballPos).normalize();
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Apuntado BALÍSTICO: encuentra la dirección de salida (elevación) para que,
 * a esta velocidad y bajo gravedad+drag (sin spin), el vuelo cruce la línea de
 * gol a la altura apuntada. Sin esto, apuntar "alto" caería corto.
 *
 * El azimut horizontal apunta directo a `aim.x` (la comba se añade luego como
 * desviación intencional sobre esta base). Resuelve la elevación por bisección.
 */
export function solveLaunchDirection(
  ballPos: THREE.Vector3,
  aim: { x: number; y: number },
  speed: number,
  dragCd: number = DEFAULT_DRAG_CD,
  iters = 18,
  dt = 1 / 120,
): THREE.Vector3 {
  const horiz = new THREE.Vector3(
    aim.x - ballPos.x,
    0,
    -ballPos.z,
  ).normalize();

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

  // Bisección monótona: y de cruce crece con la elevación φ.
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
 * Sigma de dispersión angular (rad). 0 cuando el tiro es verde y la potencia
 * está en el rango óptimo. Crece con el error de timing/potencia y se reduce
 * con la precisión del pateador.
 */
export function dispersionSigma(input: ShotInput, kicker: Kicker): number {
  const timingMiss = Math.max(
    0,
    Math.abs(input.timingErrorMs) - TIMING_GREEN_HALF_MS,
  );
  const powerMiss =
    input.power < POWER_OPTIMAL_LO
      ? POWER_OPTIMAL_LO - input.power
      : input.power > POWER_OPTIMAL_HI
        ? input.power - POWER_OPTIMAL_HI
        : 0;

  const eTiming = timingMiss / TIMING_MISS_FULL_MS;
  const ePower = powerMiss / POWER_MISS_FULL_BARS;
  const err = eTiming + ePower;

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

/** Resuelve el estado inicial del balón a partir del input del tiro. */
export function solveShot(input: ShotInput, ctx: SolveContext): BallState {
  const rng = ctx.rng ?? Math.random;
  let speed = speedForPower(input.power);
  const dir = solveLaunchDirection(ctx.ballPos, input.aim, speed);
  const spin = contactToSpin(input.contact, ctx.kicker);

  const sigma = dispersionSigma(input, ctx.kicker);
  if (sigma > 0) {
    // Desvío angular en yaw (sobre Y) y pitch (sobre el eje lateral local).
    const yaw = gaussian(rng) * sigma;
    const pitch = gaussian(rng) * sigma;
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const lateral = new THREE.Vector3()
      .crossVectors(dir, new THREE.Vector3(0, 1, 0))
      .normalize();
    dir.applyAxisAngle(lateral, pitch);

    // Wobble de velocidad y spin.
    speed *= 1 + gaussian(rng) * sigma * SPEED_WOBBLE;
    spin.x += gaussian(rng) * sigma * SPIN_WOBBLE;
    spin.y += gaussian(rng) * sigma * SPIN_WOBBLE;
  }

  return {
    pos: ctx.ballPos.clone(),
    vel: dir.multiplyScalar(speed),
    spin,
  };
}
