import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBarrierCollider, bounceGround, raiseBarrier, resolveGoalLine, ShotCollider } from './collisions';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS } from './field';
import { traceTrajectory, type BallState } from './ballistics';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('collisions — cruce del arco', () => {
  it('tiro al centro y bajo el travesaño = GOAL', () => {
    const r = resolveGoalLine(v(0, 1.2, 1), v(0, 1.2, -0.2));
    expect(r.event).toBe('GOAL');
    expect(r.cross?.y).toBeCloseTo(1.2, 3);
  });

  it('tiro por encima del travesaño = OUT', () => {
    const r = resolveGoalLine(v(0, 3.2, 1), v(0, 3.2, -0.2));
    expect(r.event).toBe('OUT');
  });

  it('al palo = POST', () => {
    const r = resolveGoalLine(v(GOAL_HALF_WIDTH, 1.0, 1), v(GOAL_HALF_WIDTH, 1.0, -0.2));
    expect(r.event).toBe('POST');
  });

  it('a la altura del travesaño = CROSSBAR', () => {
    const r = resolveGoalLine(v(0, GOAL_HEIGHT, 1), v(0, GOAL_HEIGHT, -0.2));
    expect(r.event).toBe('CROSSBAR');
  });

  it('ancho del arco = OUT', () => {
    const r = resolveGoalLine(v(6, 1.0, 1), v(6, 1.0, -0.2));
    expect(r.event).toBe('OUT');
  });

  it('sin cruzar la línea no hay evento', () => {
    expect(resolveGoalLine(v(0, 1.2, 5), v(0, 1.2, 3)).event).toBeNull();
  });
});

describe('collisions - barrera', () => {
  it('marca WALL cuando el balon cruza la capsula de un jugador', () => {
    const barrier = buildBarrierCollider(v(0, BALL_RADIUS, 25), {
      players: 4,
      distance: 9.15,
    });
    const state: BallState = {
      pos: v(0, 1.05, 25),
      vel: v(0, 0, -20),
      spin: v(0, 0, 0),
    };
    const collider = new ShotCollider(1, barrier);

    collider.begin(state);
    state.pos.set(0, 1.05, 14);

    const hit = collider.update(state);
    expect(hit.event).toBe('WALL');
    expect(hit.cross?.y).toBeCloseTo(1.05, 3);
  });

  it('barrera que SALTA: el raso pasa por debajo pero el tiro medio se bloquea', () => {
    const standing = buildBarrierCollider(v(0, BALL_RADIUS, 25), { players: 4, distance: 9.15 })!;
    const jumped = raiseBarrier(standing, 0.55);

    // Raso a la altura del balón: pasa por el hueco bajo la barrera saltada.
    const low: BallState = { pos: v(0, BALL_RADIUS, 25), vel: v(0, 0, -22), spin: v(0, 0, 0) };
    const lowCol = new ShotCollider(1, jumped);
    lowCol.begin(low);
    low.pos.set(0, BALL_RADIUS, 14);
    expect(lowCol.update(low).event).toBeNull();

    // El mismo raso contra la barrera EN EL SUELO sí choca.
    const low2: BallState = { pos: v(0, BALL_RADIUS, 25), vel: v(0, 0, -22), spin: v(0, 0, 0) };
    const standCol = new ShotCollider(1, standing);
    standCol.begin(low2);
    low2.pos.set(0, BALL_RADIUS, 14);
    expect(standCol.update(low2).event).toBe('WALL');

    // Tiro medio: la barrera saltada lo sigue bloqueando.
    const mid: BallState = { pos: v(0, 1.0, 25), vel: v(0, 0, -22), spin: v(0, 0, 0) };
    const midCol = new ShotCollider(1, jumped);
    midCol.begin(mid);
    mid.pos.set(0, 1.0, 14);
    expect(midCol.update(mid).event).toBe('WALL');
  });

  it('deja pasar un tiro claramente por encima de la barrera', () => {
    const barrier = buildBarrierCollider(v(0, BALL_RADIUS, 25), {
      players: 4,
      distance: 9.15,
    });
    const state: BallState = {
      pos: v(0, 2.45, 25),
      vel: v(0, 0, -20),
      spin: v(0, 0, 0),
    };
    const collider = new ShotCollider(1, barrier);

    collider.begin(state);
    state.pos.set(0, 2.45, 14);

    expect(collider.update(state).event).toBeNull();
  });
});

describe('collisions — rebote en el suelo', () => {
  it('invierte y amortigua la velocidad vertical en un bote real', () => {
    const state: BallState = {
      pos: v(0, BALL_RADIUS - 0.01, 10),
      vel: v(2, -10, -5),
      spin: v(0, 40, 0),
    };
    const bounced = bounceGround(state);
    expect(bounced).toBe(true);
    expect(state.vel.y).toBeGreaterThan(0); // rebotó hacia arriba
    expect(state.vel.y).toBeLessThan(10); // perdió energía
    expect(state.pos.y).toBeCloseTo(BALL_RADIUS, 5);
  });

  it('un raso rasante RUEDA perdiendo poca velocidad por frame (no muere al instante)', () => {
    const state: BallState = {
      pos: v(0, BALL_RADIUS - 0.001, 12),
      vel: v(0, -0.1, -20),
      spin: v(0, 0, 0),
    };
    bounceGround(state, 1, 1 / 120);
    expect(state.pos.y).toBeCloseTo(BALL_RADIUS, 5);
    expect(state.vel.y).toBe(0); // se asienta, no rebota
    expect(Math.abs(state.vel.z)).toBeGreaterThan(19.5); // <3% de pérdida en un frame
  });
});

describe('collisions — balón muerto (anti-freeze)', () => {
  it('un balón en el suelo demasiado lento se resuelve como OUT', () => {
    const state: BallState = { pos: v(0, BALL_RADIUS, 12), vel: v(0.2, 0, -0.3), spin: v(0, 0, 0) };
    const collider = new ShotCollider(1);
    collider.begin(state);
    state.pos.set(0, BALL_RADIUS, 11.997);
    expect(collider.update(state, 1 / 120).event).toBe('OUT');
  });

  it('un balón rasante todavía rápido NO se da por muerto', () => {
    const state: BallState = { pos: v(0, BALL_RADIUS, 12), vel: v(0, 0, -16), spin: v(0, 0, 0) };
    const collider = new ShotCollider(1);
    collider.begin(state);
    state.pos.set(0, BALL_RADIUS, 11.87);
    expect(collider.update(state, 1 / 120).event).toBeNull();
  });

  it('un tiro raso real termina rápido en un evento terminal (no freeze de 5 s)', () => {
    const angle = THREE.MathUtils.degToRad(-1.1);
    const speed = 26;
    const dir = v(0, Math.sin(angle), -Math.cos(angle)).multiplyScalar(speed);
    const initial: BallState = { pos: v(0, BALL_RADIUS, 20), vel: dir, spin: v(0, 0, 0) };
    const trace = traceTrajectory(initial, {
      dragCd: 0.27,
      groundBounceScale: 0.08,
      detectCollision: true,
    });
    expect(trace.event).not.toBeNull();
    expect(trace.time).toBeLessThan(2.5);
  });
});
