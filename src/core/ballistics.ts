import * as THREE from 'three';
import { MASS, AREA, GRAVITY, AIR_DENSITY, MAGNUS_S } from '@/core/physics';
import { ShotCollider, type BarrierColliderConfig, type CollisionResult } from '@/core/collisions';

export interface BallState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

export interface FlightParams {
  dragCd: number;
  magnusScale?: number;
  wind?: THREE.Vector3;
  groundBounceScale?: number;
  barrier?: BarrierColliderConfig;
  /** Rebote físico en los tubos (default true). El preview lo pone en false. */
  bouncePosts?: boolean;
}

export interface TraceOptions extends FlightParams {
  dt?: number;
  maxTime?: number;
  stop?: (state: BallState) => boolean;
  detectCollision?: boolean;
}

export interface TraceResult {
  samples: THREE.Vector3[];
  final: BallState;
  time: number;
  event: CollisionResult['event'];
  cross?: CollisionResult['cross'];
}

export const FIXED_TIMESTEP = 1 / 120;
export const DEFAULT_DRAG_CD = 0.25;
export const KNUCKLE_DRAG_CD = 0.45;
export const DEFAULT_MAGNUS_SCALE = 1;

const _rel = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _magnus = new THREE.Vector3();

export function cloneBallState(state: BallState): BallState {
  return {
    pos: state.pos.clone(),
    vel: state.vel.clone(),
    spin: state.spin.clone(),
  };
}

export function stepBall(
  state: BallState,
  dt: number,
  params: FlightParams,
): void {
  _rel.copy(state.vel);
  if (params.wind) _rel.sub(params.wind);
  const speed = _rel.length();

  _acc.set(0, -GRAVITY, 0);

  if (speed > 1e-6) {
    const dragMag = (0.5 * AIR_DENSITY * params.dragCd * AREA * speed) / MASS;
    _acc.addScaledVector(_rel, -dragMag);
  }

  _magnus
    .crossVectors(state.spin, _rel)
    .multiplyScalar((MAGNUS_S * (params.magnusScale ?? DEFAULT_MAGNUS_SCALE)) / MASS);
  _acc.add(_magnus);

  state.vel.addScaledVector(_acc, dt);
  state.pos.addScaledVector(state.vel, dt);
}

export function traceTrajectory(
  initial: BallState,
  opts: TraceOptions,
): TraceResult {
  const dt = opts.dt ?? FIXED_TIMESTEP;
  const maxTime = opts.maxTime ?? 6;
  const state = cloneBallState(initial);
  const samples: THREE.Vector3[] = [state.pos.clone()];
  const collider = opts.detectCollision
    ? new ShotCollider(opts.groundBounceScale ?? 1, opts.barrier, opts.bouncePosts ?? true)
    : null;
  if (collider) collider.begin(state);

  let time = 0;
  let event: CollisionResult['event'] = null;
  let cross: CollisionResult['cross'];

  while (time < maxTime) {
    stepBall(state, dt, opts);
    time += dt;
    samples.push(state.pos.clone());

    if (collider) {
      const hit = collider.update(state, dt);
      if (hit.event) {
        event = hit.event;
        cross = hit.cross;
        break;
      }
    }
    if (opts.stop?.(state)) break;
  }

  return { samples, final: state, time, event, cross };
}
