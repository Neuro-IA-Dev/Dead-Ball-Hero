import * as THREE from 'three';
import type { BallState } from '@/core/ballistics';
import {
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_LINE_Z,
  POST_RADIUS,
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
  /** Rebote NO terminal contra un tubo del arco (para SFX/feedback). */
  bounce?: 'post' | 'crossbar';
}

export interface BarrierSetup {
  players: number;
  distance: number;
  spacing?: number;
  radius?: number;
  height?: number;
}

export interface BarrierPlayerCollider {
  index: number;
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Cuánto se eleva del suelo (m). >0 = saltó: deja hueco abajo para el raso. */
  riseY: number;
}

export interface BarrierColliderConfig {
  players: BarrierPlayerCollider[];
}

const DEFAULT_BARRIER_SPACING = 0.58;
const DEFAULT_BARRIER_RADIUS = 0.26;
const DEFAULT_BARRIER_HEIGHT = 1.82;

export function buildBarrierCollider(
  ballPos: THREE.Vector3,
  setup: BarrierSetup | null,
): BarrierColliderConfig | undefined {
  if (!setup || setup.players <= 0) return undefined;

  const toGoalX = -ballPos.x;
  const toGoalZ = -ballPos.z;
  const len = Math.hypot(toGoalX, toGoalZ) || 1;
  const dirX = toGoalX / len;
  const dirZ = toGoalZ / len;
  const rightX = -dirZ;
  const rightZ = dirX;
  const centerX = ballPos.x + dirX * setup.distance;
  const centerZ = ballPos.z + dirZ * setup.distance;
  const spacing = setup.spacing ?? DEFAULT_BARRIER_SPACING;
  const radius = setup.radius ?? DEFAULT_BARRIER_RADIUS;
  const height = setup.height ?? DEFAULT_BARRIER_HEIGHT;
  const players: BarrierPlayerCollider[] = [];

  for (let i = 0; i < setup.players; i++) {
    const offset = (i - (setup.players - 1) / 2) * spacing;
    players.push({
      index: i,
      x: centerX + rightX * offset,
      z: centerZ + rightZ * offset,
      radius,
      height,
      riseY: 0,
    });
  }

  return { players };
}

/** Devuelve una copia de la barrera con los jugadores elevados `riseY` metros
 *  (la barrera que SALTA: el balón rasante pasa por debajo). */
export function raiseBarrier(
  config: BarrierColliderConfig,
  riseY: number,
): BarrierColliderConfig {
  return { players: config.players.map((p) => ({ ...p, riseY })) };
}

// --- Rebote y rodadura en el suelo ----------------------------------------

const GROUND_RESTITUTION = 0.45; // cuánta velocidad vertical conserva un bote real
const BOUNCE_FRICTION = 0.72; // retención horizontal SOLO en un bote real
const SPIN_DAMP_ON_BOUNCE = 0.6;
/** |vy| (m/s) bajo el cual el contacto con el suelo es rodadura, no bote. */
const BOUNCE_VY = 0.6;
/** Fricción de rodadura por SEGUNDO (no por bote): decel. suave del balón rasante. */
const ROLL_FRICTION_PER_S = 0.55;
const DEFAULT_DT = 1 / 120;

/**
 * Resuelve el contacto del balón con el suelo. Distingue dos regímenes:
 *  - **Bote real** (vy claramente negativa): invierte y amortigua la vertical y
 *    aplica fricción tangencial de impacto.
 *  - **Rodadura** (vy pequeña): pega el balón al césped y aplica fricción por
 *    TIEMPO, no por contacto. Antes se aplicaba 0.72 por frame en micro-botes,
 *    lo que mataba al instante a los tiros rasos (de ahí el freeze a mitad de
 *    cancha). Muta el estado y devuelve true si hubo contacto.
 */
export function bounceGround(
  state: BallState,
  bounceScale: number = 1,
  dt: number = DEFAULT_DT,
): boolean {
  if (state.pos.y - BALL_RADIUS > 0) return false;

  if (state.vel.y < -BOUNCE_VY) {
    state.pos.y = BALL_RADIUS;
    state.vel.y = -state.vel.y * GROUND_RESTITUTION * bounceScale;
    state.vel.x *= BOUNCE_FRICTION;
    state.vel.z *= BOUNCE_FRICTION;
    state.spin.multiplyScalar(SPIN_DAMP_ON_BOUNCE);
    return true;
  }

  // Rodadura: el balón se asienta y rueda perdiendo velocidad suavemente.
  state.pos.y = BALL_RADIUS;
  if (state.vel.y < 0) state.vel.y = 0;
  const keep = Math.max(0, 1 - ROLL_FRICTION_PER_S * dt);
  state.vel.x *= keep;
  state.vel.z *= keep;
  return true;
}

/** Velocidad horizontal (m/s) bajo la cual un balón en el suelo se da por muerto. */
const REST_SPEED = 0.7;

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

// --- Postes y travesaño como TUBOS (rebote, no evento terminal) ------------

/** Restitución del tubo: < 1 = pierde energía (palo seco). */
const POST_RESTITUTION = 0.62;
/** Solo evaluamos el rebote cerca del plano del arco. */
const POST_Z_BAND = 0.4;

interface PostSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  kind: 'post' | 'crossbar';
}

const POST_SEGMENTS: PostSegment[] = [
  // Poste izquierdo y derecho (verticales).
  { a: new THREE.Vector3(-GOAL_HALF_WIDTH, 0, 0), b: new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT, 0), kind: 'post' },
  { a: new THREE.Vector3(GOAL_HALF_WIDTH, 0, 0), b: new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT, 0), kind: 'post' },
  // Travesaño (horizontal).
  { a: new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT, 0), b: new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT, 0), kind: 'crossbar' },
];

const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _normal = new THREE.Vector3();

/** Rebota el balón contra un segmento (eje del tubo). Muta el estado. */
function reflectOffSegment(state: BallState, seg: PostSegment): boolean {
  _ab.subVectors(seg.b, seg.a);
  _ap.subVectors(state.pos, seg.a);
  const abLenSq = _ab.lengthSq() || 1;
  const t = Math.max(0, Math.min(1, _ap.dot(_ab) / abLenSq));
  _closest.copy(seg.a).addScaledVector(_ab, t);
  _normal.subVectors(state.pos, _closest);
  const dist = _normal.length();
  const minDist = POST_RADIUS + BALL_RADIUS;
  if (dist > minDist) return false;

  if (dist > 1e-5) _normal.multiplyScalar(1 / dist);
  else _normal.set(Math.sign(state.pos.x) || 1, 0, 1).normalize();

  const vn = state.vel.dot(_normal);
  if (vn < 0) state.vel.addScaledVector(_normal, -(1 + POST_RESTITUTION) * vn);
  // Reposiciona el balón en la superficie del tubo (evita que se quede dentro).
  state.pos.copy(_closest).addScaledVector(_normal, minDist + 1e-3);
  return true;
}

/** Rebote contra postes/travesaño. Devuelve el tubo golpeado o null. */
export function resolvePostBounce(state: BallState): 'post' | 'crossbar' | null {
  if (Math.abs(state.pos.z) > POST_Z_BAND) return null;
  for (const seg of POST_SEGMENTS) {
    if (reflectOffSegment(state, seg)) return seg.kind;
  }
  return null;
}

function resolveBarrier(
  prev: THREE.Vector3,
  cur: THREE.Vector3,
  barrier: BarrierColliderConfig | undefined,
): CollisionResult {
  if (!barrier || barrier.players.length === 0) return { event: null };

  const dx = cur.x - prev.x;
  const dz = cur.z - prev.z;
  const denom = dx * dx + dz * dz;

  for (const player of barrier.players) {
    const rawT =
      denom > 1e-9
        ? ((player.x - prev.x) * dx + (player.z - prev.z) * dz) / denom
        : 0;
    const t = Math.max(0, Math.min(1, rawT));
    const x = lerp(prev.x, cur.x, t);
    const y = lerp(prev.y, cur.y, t);
    const z = lerp(prev.z, cur.z, t);
    const horizontalDistance = Math.hypot(x - player.x, z - player.z);
    const bottom = player.riseY > 0.01 ? player.riseY - BALL_RADIUS : BALL_RADIUS * 0.35;
    const top = player.riseY + player.height + BALL_RADIUS;

    if (
      horizontalDistance <= player.radius + BALL_RADIUS &&
      y >= bottom &&
      y <= top
    ) {
      return { event: 'WALL', cross: { x, y } };
    }
  }

  return { event: null };
}

// --- Colisionador con estado (recuerda la posición previa) ----------------

/**
 * Recuerda la posición previa para detectar el cruce del arco entre pasos.
 * El controlador de vuelo (1.12) lo alimenta cada frame de simulación.
 */
export class ShotCollider {
  private prev = new THREE.Vector3();
  /** El balón ya rebotó en un tubo en este vuelo (para etiquetar POST). */
  private postHit = false;

  constructor(
    private readonly groundBounceScale: number = 1,
    private readonly barrier?: BarrierColliderConfig,
    /** Rebote físico en los tubos (solo el vuelo real; el preview lo desactiva
     *  para NO revelar el carom del palo y no ensuciar la escena). */
    private readonly bouncePosts: boolean = true,
  ) {}

  begin(state: BallState): void {
    this.prev.copy(state.pos);
    this.postHit = false;
  }

  /** Procesa un paso ya integrado. Devuelve el evento terminal o null. */
  update(state: BallState, dt: number = DEFAULT_DT): CollisionResult {
    bounceGround(state, this.groundBounceScale, dt);

    const wall = resolveBarrier(this.prev, state.pos, this.barrier);
    if (wall.event) return wall;

    // Tubos del arco: rebote NO terminal (puede entrar o salir tras pegar).
    const bounce = this.bouncePosts ? resolvePostBounce(state) : null;
    if (bounce) {
      this.postHit = true;
      this.prev.copy(state.pos);
      return { event: null, bounce };
    }

    const goal = resolveGoalLine(this.prev, state.pos);
    this.prev.copy(state.pos);
    // Palo y adentro = GOAL; palo y afuera = POST (en vez de OUT).
    if (goal.event === 'GOAL') return goal;
    if (goal.event === 'OUT' && this.postHit) {
      return goal.cross ? { event: 'POST', cross: goal.cross } : { event: 'POST' };
    }
    if (goal.event) return goal;

    if (isOutOfPlay(state.pos)) return { event: this.postHit ? 'POST' : 'OUT' };

    // Balón muerto: rodando en el suelo demasiado lento para llegar al arco.
    // Resuelve en una fracción de segundo en vez de esperar el safeguard (freeze).
    if (
      state.pos.y <= BALL_RADIUS + 0.02 &&
      Math.hypot(state.vel.x, state.vel.z) < REST_SPEED
    ) {
      return { event: this.postHit ? 'POST' : 'OUT' };
    }

    return { event: null };
  }
}
