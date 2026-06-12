import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { traceTrajectory } from '@/core/ballistics';
import { launchToBallState, solveShotIntent, shotIntentFromInput } from './shot-solver';
import { TRAINING_RIGHT_FOOT } from './kicker';
import type { ShotInput } from './shot-machine';

function ballPos(z: number): THREE.Vector3 {
  return new THREE.Vector3(0, 0.11, z);
}

function sampleMaxHeight(samples: THREE.Vector3[]): number {
  return samples.reduce((max, sample) => Math.max(max, sample.y), 0);
}

describe('shot audit invariants', () => {
  it('keeps a driven low attempt materially below a natural shot at the same target', () => {
    const pos = ballPos(18);
    const aim = { x: -0.2, y: 0.9 };

    const lowInput: ShotInput = {
      aim,
      contact: { x: 0, y: -0.75 },
      power: 2.0,
    };
    const naturalInput: ShotInput = {
      aim,
      contact: { x: 0.02, y: 0.02 },
      power: 2.0,
    };

    const lowLaunch = solveShotIntent(
      shotIntentFromInput(lowInput, { ballPos: pos, kicker: TRAINING_RIGHT_FOOT }),
      { ballPos: pos, kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );
    const naturalLaunch = solveShotIntent(
      shotIntentFromInput(naturalInput, { ballPos: pos, kicker: TRAINING_RIGHT_FOOT }),
      { ballPos: pos, kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );

    const lowTrace = traceTrajectory(launchToBallState(pos, lowLaunch), {
      dragCd: lowLaunch.dragCd,
      magnusScale: lowLaunch.magnusScale,
      groundBounceScale: lowLaunch.groundBounceScale,
      detectCollision: true,
      stop: (state) => state.pos.z <= -3 || state.pos.y < -0.1,
    });
    const naturalTrace = traceTrajectory(launchToBallState(pos, naturalLaunch), {
      dragCd: naturalLaunch.dragCd,
      magnusScale: naturalLaunch.magnusScale,
      groundBounceScale: naturalLaunch.groundBounceScale,
      detectCollision: true,
      stop: (state) => state.pos.z <= -3 || state.pos.y < -0.1,
    });

    const lowMax = sampleMaxHeight(lowTrace.samples);
    const naturalMax = sampleMaxHeight(naturalTrace.samples);

    expect(lowLaunch.shotType).toBe('driven_low');
    expect(naturalLaunch.shotType).toBe('natural');
    expect(lowMax).toBeLessThan(0.32);
    expect(lowMax).toBeLessThan(naturalMax - 0.35);
  });

  it('does not let the reticle compensate away a bad power choice', () => {
    const pos = ballPos(24);
    const aim = { x: -0.35, y: 1.55 };
    const contact = { x: 0.02, y: 0.02 };

    const idealLaunch = solveShotIntent(
      shotIntentFromInput({ aim, contact, power: 3.0 }, { ballPos: pos, kicker: TRAINING_RIGHT_FOOT }),
      { ballPos: pos, kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );
    const weakLaunch = solveShotIntent(
      shotIntentFromInput({ aim, contact, power: 1.45 }, { ballPos: pos, kicker: TRAINING_RIGHT_FOOT }),
      { ballPos: pos, kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );

    const idealTrace = traceTrajectory(launchToBallState(pos, idealLaunch), {
      dragCd: idealLaunch.dragCd,
      magnusScale: idealLaunch.magnusScale,
      groundBounceScale: idealLaunch.groundBounceScale,
      detectCollision: true,
      stop: (state) => state.pos.z <= -3 || state.pos.y < -0.1,
    });
    const weakTrace = traceTrajectory(launchToBallState(pos, weakLaunch), {
      dragCd: weakLaunch.dragCd,
      magnusScale: weakLaunch.magnusScale,
      groundBounceScale: weakLaunch.groundBounceScale,
      detectCollision: true,
      stop: (state) => state.pos.z <= -3 || state.pos.y < -0.1,
    });

    expect(idealTrace.cross).toBeTruthy();
    expect(Math.abs(idealTrace.cross!.y - aim.y)).toBeLessThan(0.35);
    if (weakTrace.cross) {
      expect(Math.abs(weakTrace.cross.y - aim.y)).toBeGreaterThan(0.55);
    } else {
      expect(weakTrace.final.pos.z).toBeGreaterThan(0);
    }
  });

  it('keeps curve shots under a sane ceiling instead of ballooning', () => {
    const pos = ballPos(25);
    const input: ShotInput = {
      aim: { x: Math.tan(THREE.MathUtils.degToRad(-6)) * 25, y: 1.45 },
      contact: { x: 0.65, y: 0.05 },
      power: 2.85,
    };

    const launch = solveShotIntent(
      shotIntentFromInput(input, { ballPos: pos, kicker: TRAINING_RIGHT_FOOT }),
      { ballPos: pos, kicker: TRAINING_RIGHT_FOOT },
      { applyDispersion: false },
    );
    const trace = traceTrajectory(launchToBallState(pos, launch), {
      dragCd: launch.dragCd,
      magnusScale: launch.magnusScale,
      stop: (state) => state.pos.z <= -3 || state.pos.y < -0.1,
    });

    expect(launch.shotType).toBe('inside_curve');
    expect(sampleMaxHeight(trace.samples)).toBeLessThan(4);
  });
});
