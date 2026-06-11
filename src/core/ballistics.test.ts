import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { traceTrajectory, DEFAULT_DRAG_CD, type BallState } from './ballistics';
import { speedForPower, MAX_CURVE_SPIN } from './physics';
import { BALL_RADIUS } from './field';

/**
 * Test de calibración (CLAUDE.md / tarea 1.3): con 3 barras de potencia y
 * curva máxima, el balón debe desplazarse ~3 m lateralmente al recorrer 25 m.
 */
describe('ballistics — calibración Magnus', () => {
  it('3 barras + curva máxima ≈ 3 m de comba lateral a 25 m', () => {
    const start = new THREE.Vector3(0, BALL_RADIUS, 25);
    const aim = new THREE.Vector3(0, 1.2, 0); // al centro del arco
    const speed = speedForPower(3); // ≈ 28 m/s

    const dir = aim.clone().sub(start).normalize();
    const initial: BallState = {
      pos: start.clone(),
      vel: dir.multiplyScalar(speed),
      spin: new THREE.Vector3(0, MAX_CURVE_SPIN, 0), // eje vertical → comba lateral
    };

    // Detener al cruzar la línea de gol (z <= 0).
    const { final } = traceTrajectory(initial, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });

    const lateral = Math.abs(final.pos.x);
    expect(lateral).toBeGreaterThan(2.5);
    expect(lateral).toBeLessThan(3.5);
  });

  it('speedForPower respeta el rango 18–38 m/s', () => {
    expect(speedForPower(1)).toBeCloseTo(18, 5);
    expect(speedForPower(5)).toBeCloseTo(38, 5);
    expect(speedForPower(3)).toBeCloseTo(28, 5);
  });
});
