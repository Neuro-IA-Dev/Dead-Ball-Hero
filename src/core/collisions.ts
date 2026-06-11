import * as THREE from 'three';
import type { BallState } from '@/core/ballistics';
import {
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_LINE_Z,
  BALL_RADIUS,
  FIELD_HALF_WIDTH,
} from '@/core/field';

/**
 * Colisiones y resolución del tiro — tarea 1.4.
 *
 * Eventos del tiro. GOAL/POST/CROSSBAR/OUT se resuelven aquí; SAVED y WALL
 * los producen el arquero (1.11) y la barrera (1.10) sobre este mismo enum.
 */
export type ShotEvent =
  | 'GOAL'
  | 'POST'
  | 'CROSSBAR'
  | 'SAVED'
  | 'WALL'
  | 'OUT';

/** Punto donde el balón cruzó el plano del arco (para repetición/feedback). */
export interface CrossInfo {
  x: number;
  y: number;
}

export interface CollisionResult {
  event: ShotEvent | null;
  cross?: CrossInfo;
}

// --- Rebote en el suelo (amortiguado) -------------------------------------

const GROUND_RESTITUTION = 0.45; // cuánta velocidad vertical conserva
const GROUND_FRICTION = 0.72; // retención horizontal por bote
const SPIN_DAMP_ON_BOUNCE = 0.6;

/** Si el balón toca el suelo bajando, lo hace rebotar. Muta y devuelve true. */
export function bounceGround(state: BallState): boolean {
  if (state.pos.y - BALL_RADIUS <= 0 && state.vel.y < 0) {
    state.pos.y = BALL_RADIUS;
    state.vel.y = -state.vel.y * GROUND_RESTITUTION;
    state.vel.x *= GROUND_FRICTION;
    state.vel.z *= GROUND_FRICTION;
    state.spin.multiplyScalar(SPIN_DAMP_ON_BOUNCE);
    return true;
  }
  return false;
}

// --- Cruce del plano del arco ---------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Decide el evento cuando el balón cruza la línea de gol (z = 0).
 * `prev` y `cur` son las posiciones de centro del balón antes y después del paso.
 * Devuelve null si en este paso no cruzó.
 */
export function resolveGoalLine(
  prev: THREE.Vector3,
  cur: THREE.Vector3,
): CollisionResult {
  // Solo nos interesa el cruce de adelante hacia atrás (z+ → z-).
  if (prev.z <= GOAL_LINE_Z || cur.z > GOAL_LINE_Z) {
    return { event: null };
  }

  const span = prev.z - cur.z;
  const tCross = span > 1e-9 ? (prev.z - GOAL_LINE_Z) / span : 0;
  const x = lerp(prev.x, cur.x, tCross);
  const y = lerp(prev.y, cur.y, tCross);
  const cross: CrossInfo = { x, y };

  const onCrossbar =
    y >= GOAL_HEIGHT - BALL_RADIUS &&
    y <= GOAL_HEIGHT + BALL_RADIUS &&
    Math.abs(x) <= GOAL_HALF_WIDTH + BALL_RADIUS;
  if (onCrossbar) return { event: 'CROSSBAR', cross };

  const onPost =
    Math.abs(x) >= GOAL_HALF_WIDTH - BALL_RADIUS &&
    Math.abs(x) <= GOAL_HALF_WIDTH + BALL_RADIUS &&
    y > 0 &&
    y <= GOAL_HEIGHT + BALL_RADIUS;
  if (onPost) return { event: 'POST', cross };

  const inside =
    Math.abs(x) < GOAL_HALF_WIDTH - BALL_RADIUS &&
    y > 0 &&
    y < GOAL_HEIGHT - BALL_RADIUS;
  if (inside) return { event: 'GOAL', cross };

  // Cruzó el plano pero por fuera (ancho o por encima).
  return { event: 'OUT', cross };
}

/** True si el balón salió del campo jugable (ancho o muy detrás del arco). */
export function isOutOfPlay(pos: THREE.Vector3): boolean {
  return Math.abs(pos.x) > FIELD_HALF_WIDTH || pos.z < -3;
}

// --- Colisionador con estado (recuerda la posición previa) ----------------

/**
 * Recuerda la posición previa para detectar el cruce del arco entre pasos.
 * El controlador de vuelo (1.12) lo alimenta cada frame de simulación.
 */
export class ShotCollider {
  private prev = new THREE.Vector3();

  begin(state: BallState): void {
    this.prev.copy(state.pos);
  }

  /** Procesa un paso ya integrado. Devuelve el evento terminal o null. */
  update(state: BallState): CollisionResult {
    bounceGround(state);

    const goal = resolveGoalLine(this.prev, state.pos);
    this.prev.copy(state.pos);
    if (goal.event) return goal;

    if (isOutOfPlay(state.pos)) return { event: 'OUT' };

    return { event: null };
  }
}
