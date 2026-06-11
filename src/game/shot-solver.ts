import * as THREE from 'three';
import type { ShotInput } from '@/game/shot-machine';
import type { Kicker } from '@/game/kicker';
import type { BallState } from '@/core/ballistics';
import {
  speedForPower,
  MAX_CURVE_SPIN,
  MAX_TOPSPIN,
} from '@/core/physics';

/**
 * Solver del tiro — tarea 1.9, reworkeado en 1.9b.2/1.9b.4.
 * **PUNTO DE AUDITORÍA (con 1.18).**
 *
 * Mapea (azimut, contacto, potencia) → estado inicial del balón (velocidad +
 * spin). Edición 26: NO hay timing; la maestría está en la potencia justa y en
 * alinear la línea de proyección.
 *
 * Convenciones de ejes (ver core/field.ts): +X derecha, +Z hacia el campo
 * (el balón viaja en -Z), +Y arriba.
 *
 * Dirección:
 *   - Azimut: rota la horizontal alrededor de Y (apuntado del usuario).
 *   - Elevación: NO la elige el usuario; se deriva de tipo de golpe +
 *     contacto.Y + potencia (tabla `BASE_ELEVATION`). El jugador ajusta la
 *     potencia para que la línea de proyección llegue al arco.
 *
 * Spin:
 *   - Comba lateral: spin sobre Y. Con v en -Z, ω=+Y desvía hacia -X.
 *     contacto.x>0 ⇒ comba a la izquierda (escala con CUR).
 *   - Caída/topspin: spin sobre X. contacto.y>0 ⇒ ωx<0 ⇒ la pelota cae.
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

/**
 * Tipo de golpe según la zona del contacto y el pie del pateador.
 * Lo usan la etiqueta del selector (1.9b.3) y la elevación/óptimo de potencia.
 */
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

/**
 * Elevación base de salida (rad) por tipo de golpe. El usuario NO la apunta;
 * el rango de la potencia hace el "ranging". Calibrado para distancias del
 * Acto 1 (~18–22 m); afinar en 1.18.
 */
const BASE_ELEVATION: Record<ContactType, number> = {
  chanfle_interior: 0.21,
  chanfle_exterior: 0.18,
  picada: 0.3,
  raso: 0.11,
  normal: 0.2,
};
/** Cuánto sube la elevación por unidad de contacto.Y. */
const ELEV_PER_CONTACT_Y = 0.1;
/** Aplanamiento por barra de potencia sobre 3 (golpe más fuerte = más raso). */
const ELEV_PER_POWER = 0.008;

/** Centro óptimo de potencia (barras) por tipo de golpe (recetas CLAUDE.md). */
const OPTIMAL_POWER: Record<ContactType, number> = {
  chanfle_interior: 2.75,
  chanfle_exterior: 2.5,
  picada: 2.75,
  raso: 2.0,
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

/** Elevación de salida (rad) a partir del tipo, el contacto.Y y la potencia. */
export function elevationFor(
  type: ContactType,
  contactY: number,
  power: number,
): number {
  return (
    BASE_ELEVATION[type] +
    contactY * ELEV_PER_CONTACT_Y -
    (power - 3) * ELEV_PER_POWER
  );
}

/**
 * Dirección horizontal del tiro según el azimut. Base = del balón al centro
 * del arco; azimut + desvía hacia +X (la derecha del arquero). Compartida por
 * el solver y la cámara de apuntado para que nunca diverjan.
 */
export function horizontalAzimuthDir(
  ballPos: THREE.Vector3,
  azimuth: number,
): THREE.Vector3 {
  const horiz = new THREE.Vector3(-ballPos.x, 0, -ballPos.z).normalize();
  return horiz.applyAxisAngle(UP, -azimuth);
}

/** Dirección de salida desde el azimut (horizontal) y la elevación. */
export function shotDirection(
  ballPos: THREE.Vector3,
  azimuth: number,
  elevation: number,
): THREE.Vector3 {
  return horizontalAzimuthDir(ballPos, azimuth)
    .multiplyScalar(Math.cos(elevation))
    .addScaledVector(UP, Math.sin(elevation));
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
 * Estado inicial DETERMINISTA (sin dispersión). Lo usan la línea de proyección
 * (1.9b.2) y `solveShot`. No muta `ctx`.
 */
export function buildInitialState(input: ShotInput, ctx: SolveContext): BallState {
  const type = classifyContact(input.contact, ctx.kicker);
  const elevation = elevationFor(type, input.contact.y, input.power);
  const dir = shotDirection(ctx.ballPos, input.aim.azimuth, elevation);
  const speed = speedForPower(input.power);
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
