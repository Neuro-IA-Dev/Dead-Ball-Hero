import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveGoalLine, bounceGround } from './collisions';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS } from './field';
import type { BallState } from './ballistics';

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

describe('collisions — rebote en el suelo', () => {
  it('invierte y amortigua la velocidad vertical', () => {
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
});
