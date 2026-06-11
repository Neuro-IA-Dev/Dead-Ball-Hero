import * as THREE from 'three';
import { MASS, AREA, GRAVITY, AIR_DENSITY, MAGNUS_S } from '@/core/physics';

/**
 * Integrador balístico del balón — tarea 1.3.
 *
 * Física propia (CLAUDE.md): integración semi-implícita de Euler con
 *   - gravedad,
 *   - drag cuadrático: Fd = -½·ρ·Cd·A·|v|·v
 *   - efecto Magnus:   Fm = S·(ω × v)
 *
 * Trabaja sobre el airspeed relativo (v - viento). Muta el estado en sitio
 * para no asignar vectores en el loop a 60 fps.
 */

export interface BallState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Velocidad angular ω (rad/s). Su eje define el tipo de comba. */
  spin: THREE.Vector3;
}

export interface FlightParams {
  /** Coef. de arrastre. Alto spin ≈ 0.25; knuckle ≈ 0.45 (CLAUDE.md). */
  dragCd: number;
  /** Viento en m/s (Acto 4 / arcade). Por defecto nulo. */
  wind?: THREE.Vector3;
}

export const DEFAULT_DRAG_CD = 0.25;
export const KNUCKLE_DRAG_CD = 0.45;

// Vectores scratch reutilizados (sin asignaciones por paso).
const _rel = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _magnus = new THREE.Vector3();

/** Avanza el estado del balón un paso `dt` (segundos). Muta `state`. */
export function stepBall(
  state: BallState,
  dt: number,
  params: FlightParams,
): void {
  // Airspeed relativo al viento.
  _rel.copy(state.vel);
  if (params.wind) _rel.sub(params.wind);
  const speed = _rel.length();

  // Gravedad.
  _acc.set(0, -GRAVITY, 0);

  // Drag cuadrático: a += -(½ρ Cd A |v|)/m · v_rel
  if (speed > 1e-6) {
    const dragMag = (0.5 * AIR_DENSITY * params.dragCd * AREA * speed) / MASS;
    _acc.addScaledVector(_rel, -dragMag);
  }

  // Magnus: a += (S/m)·(ω × v_rel)
  _magnus.crossVectors(state.spin, _rel).multiplyScalar(MAGNUS_S / MASS);
  _acc.add(_magnus);

  // Euler semi-implícito: primero velocidad, luego posición.
  state.vel.addScaledVector(_acc, dt);
  state.pos.addScaledVector(state.vel, dt);
}

export interface TraceOptions extends FlightParams {
  /** Paso de integración (s). Por defecto 1/240 para precisión. */
  dt?: number;
  /** Tiempo máximo de vuelo (s). */
  maxTime?: number;
  /** Si devuelve true, detiene la traza en ese punto. */
  stop?: (state: BallState) => boolean;
}

export interface TraceResult {
  /** Posiciones muestreadas (incluye el inicio). */
  samples: THREE.Vector3[];
  /** Estado final. */
  final: BallState;
  /** Tiempo total simulado (s). */
  time: number;
}

/**
 * Simula la trayectoria completa a partir de un estado inicial, devolviendo
 * las muestras. Lo usan el test de calibración (1.3) y la línea de
 * trayectoria del apuntado (1.6). No muta el estado de entrada.
 */
export function traceTrajectory(
  initial: BallState,
  opts: TraceOptions,
): TraceResult {
  const dt = opts.dt ?? 1 / 240;
  const maxTime = opts.maxTime ?? 6;
  const state: BallState = {
    pos: initial.pos.clone(),
    vel: initial.vel.clone(),
    spin: initial.spin.clone(),
  };
  const samples: THREE.Vector3[] = [state.pos.clone()];

  let time = 0;
  while (time < maxTime) {
    stepBall(state, dt, opts);
    time += dt;
    samples.push(state.pos.clone());
    if (opts.stop?.(state)) break;
  }

  return { samples, final: state, time };
}
