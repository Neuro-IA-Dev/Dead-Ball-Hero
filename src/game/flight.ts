import * as THREE from 'three';
import { stepBall, type BallState, type FlightParams } from '@/core/ballistics';
import { ShotCollider, type ShotEvent, type CrossInfo } from '@/core/collisions';

/**
 * Vuelo del balón en curso — integra con paso fijo (estable a cualquier fps)
 * y reporta el evento terminal vía el colisionador. Lo usa el controlador de
 * juego desde la fase FLIGHT (1.6+); la cámara de seguimiento es 1.12.
 */
const FIXED_STEP = 1 / 120;
const MAX_FLIGHT_TIME = 8; // s, salvaguarda anti-bucle → OUT

export class Flight {
  readonly state: BallState;
  event: ShotEvent | null = null;
  cross: CrossInfo | undefined;
  done = false;

  private collider = new ShotCollider();
  private acc = 0;
  private elapsed = 0;
  private params: FlightParams;

  constructor(initial: BallState, params: FlightParams) {
    this.state = {
      pos: initial.pos.clone(),
      vel: initial.vel.clone(),
      spin: initial.spin.clone(),
    };
    this.params = params;
    this.collider.begin(this.state);
  }

  /** Avanza el vuelo `dt` segundos (con acumulador de paso fijo). */
  step(dt: number): void {
    if (this.done) return;
    this.acc += Math.min(dt, 0.1); // evita saltos enormes si hay lag
    while (this.acc >= FIXED_STEP) {
      stepBall(this.state, FIXED_STEP, this.params);
      this.acc -= FIXED_STEP;
      this.elapsed += FIXED_STEP;

      const r = this.collider.update(this.state);
      if (r.event) {
        this.finish(r.event, r.cross);
        return;
      }
      if (this.elapsed >= MAX_FLIGHT_TIME) {
        this.finish('OUT', undefined);
        return;
      }
    }
  }

  private finish(event: ShotEvent, cross: CrossInfo | undefined): void {
    this.event = event;
    this.cross = cross;
    this.done = true;
  }

  /** Posición actual del balón (para mover el mesh). */
  get position(): THREE.Vector3 {
    return this.state.pos;
  }
}
