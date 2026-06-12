import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  directionFromAzimuthAndElevation,
  solveShotIntent,
  shotIntentFromInput,
  launchToBallState,
  optimalPowerCenter,
} from './shot-solver';
import { DIEGO, TRAINING_RIGHT_FOOT } from './kicker';
import type { ShotInput } from './shot-machine';
import { traceTrajectory } from '@/core/ballistics';

function ballPos(z: number): THREE.Vector3 {
  return new THREE.Vector3(0, 0.11, z);
}

function shotInput(over: Partial<ShotInput>): ShotInput {
  return {
    aim: { x: 0, y: 1.35 },
    contact: { x: 0, y: 0 },
    power: optimalPowerCenter({ x: 0, y: 0 }, DIEGO),
    ...over,
  };
}

describe('directionFromAzimuthAndElevation', () => {
  it('aplica azimut en XZ y elevación en Y sin volverse casi vertical', () => {
    const dir = directionFromAzimuthAndElevation(new THREE.Vector3(0, 0, -1), -6, 17);
    expect(dir.y).toBeGreaterThan(0.2);
    expect(dir.y).toBeLessThan(0.35);
    expect(Math.abs(dir.z)).toBeGreaterThan(0.9);
  });
});

describe('tiro canónico: curva interior 25 m', () => {
  it('sale fuerte, con ángulo útil y llega al arco', () => {
    const input = shotInput({
      aim: { x: Math.tan(THREE.MathUtils.degToRad(-6)) * 25, y: 1.45 },
      contact: { x: 0.65, y: 0.05 },
      power: 2.85,
    });
    const intent = shotIntentFromInput(input, {
      ballPos: ballPos(25),
      kicker: TRAINING_RIGHT_FOOT,
    });
    const launch = solveShotIntent(
      intent,
      { ballPos: ballPos(25), kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );
    const trace = traceTrajectory(launchToBallState(ballPos(25), launch), {
      dragCd: launch.dragCd,
      magnusScale: launch.magnusScale,
      detectCollision: true,
      stop: (s) => s.pos.z <= -3,
    });

    expect(launch.debug.initialSpeed).toBeGreaterThanOrEqual(27);
    expect(launch.debug.initialSpeed).toBeLessThanOrEqual(30);
    expect(launch.debug.launchAngleDeg).toBeGreaterThanOrEqual(15);
    expect(launch.debug.launchAngleDeg).toBeLessThanOrEqual(19);
    expect(launch.debug.arcCross).not.toBeNull();
    expect(launch.debug.arcCross!.y).toBeGreaterThanOrEqual(0.3);
    expect(launch.debug.arcCross!.y).toBeLessThanOrEqual(2.6);
    expect(Math.abs(launch.velocity.y)).toBeLessThan(Math.abs(launch.velocity.z));
    expect(trace.final.pos.z).toBeLessThanOrEqual(0);
    expect(Math.abs(launch.spin.y)).toBeGreaterThan(35);
  });
});

describe('tiro raso 18 m', () => {
  it('sale bajo y llega al arco', () => {
    const input = shotInput({
      aim: { x: -0.25, y: 0.9 },
      contact: { x: 0, y: -0.75 },
      power: 2.0,
    });
    const intent = shotIntentFromInput(input, {
      ballPos: ballPos(18),
      kicker: TRAINING_RIGHT_FOOT,
    });
    const launch = solveShotIntent(
      intent,
      { ballPos: ballPos(18), kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );
    const trace = traceTrajectory(launchToBallState(ballPos(18), launch), {
      dragCd: launch.dragCd,
      magnusScale: launch.magnusScale,
      groundBounceScale: launch.groundBounceScale,
      detectCollision: true,
      stop: (s) => s.pos.z <= -3,
    });
    const maxHeight = Math.max(...trace.samples.map((sample) => sample.y));

    expect(launch.debug.launchAngleDeg).toBeGreaterThanOrEqual(-1.3);
    expect(launch.debug.launchAngleDeg).toBeLessThanOrEqual(0.4);
    expect(launch.debug.arcCross).not.toBeNull();
    expect(launch.debug.arcCross!.y).toBeLessThan(0.55);
    expect(maxHeight).toBeLessThan(0.5);
  });
});

describe('tiro natural 22 m', () => {
  it('mantiene ángulo y velocidad razonables y llega al arco', () => {
    const input = shotInput({
      aim: { x: -0.4, y: 1.3 },
      contact: { x: 0.08, y: 0.02 },
      power: 2.7,
    });
    const intent = shotIntentFromInput(input, {
      ballPos: ballPos(22),
      kicker: DIEGO,
    });
    const launch = solveShotIntent(
      intent,
      { ballPos: ballPos(22), kicker: DIEGO },
      { applyDispersion: false },
    );

    expect(launch.debug.launchAngleDeg).toBeGreaterThanOrEqual(10);
    expect(launch.debug.launchAngleDeg).toBeLessThanOrEqual(18);
    expect(launch.debug.initialSpeed).toBeGreaterThan(22);
    expect(launch.debug.arcCross).not.toBeNull();
  });
});
