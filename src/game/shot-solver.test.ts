import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  solveShot,
  aimDirection,
  contactToSpin,
  dispersionSigma,
} from './shot-solver';
import { DIEGO } from './kicker';
import type { ShotInput } from './shot-machine';
import { traceTrajectory, DEFAULT_DRAG_CD } from '@/core/ballistics';

const ballPos = () => new THREE.Vector3(0, 0.11, 20);

function input(over: Partial<ShotInput> = {}): ShotInput {
  return {
    aim: { x: 0, y: 1.0 },
    contact: { x: 0, y: 0 },
    power: 3,
    timingErrorMs: 0,
    green: true,
    ...over,
  };
}

describe('shot-solver — helpers', () => {
  it('aimDirection apunta del balón al arco (−Z)', () => {
    const d = aimDirection(ballPos(), { x: 0, y: 1.0 });
    expect(d.z).toBeLessThan(0);
    expect(Math.abs(d.x)).toBeLessThan(1e-9);
  });

  it('contacto derecha ⇒ spin.y>0 (comba); contacto arriba ⇒ spin.x<0 (caída)', () => {
    const right = contactToSpin({ x: 0.8, y: 0 }, DIEGO);
    expect(right.y).toBeGreaterThan(0);
    const up = contactToSpin({ x: 0, y: 0.8 }, DIEGO);
    expect(up.x).toBeLessThan(0);
  });

  it('dispersión = 0 en verde + potencia óptima, y crece al fallar', () => {
    expect(dispersionSigma(input(), DIEGO)).toBe(0);
    const badTiming = dispersionSigma(
      input({ timingErrorMs: 400, green: false }),
      DIEGO,
    );
    expect(badTiming).toBeGreaterThan(0);
    const badPower = dispersionSigma(input({ power: 5 }), DIEGO);
    expect(badPower).toBeGreaterThan(0);
  });

  it('mayor precisión ⇒ menor dispersión ante el mismo error', () => {
    const sharp = dispersionSigma(input({ green: false, timingErrorMs: 300 }), {
      ...DIEGO,
      pre: 95,
    });
    const sloppy = dispersionSigma(input({ green: false, timingErrorMs: 300 }), {
      ...DIEGO,
      pre: 40,
    });
    expect(sloppy).toBeGreaterThan(sharp);
  });
});

describe('shot-solver — vuelo', () => {
  it('tiro perfecto al centro es determinista y entra al arco', () => {
    const state = solveShot(input(), { ballPos: ballPos(), kicker: DIEGO });
    const { final } = traceTrajectory(state, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });
    expect(Math.abs(final.pos.x)).toBeLessThan(0.3); // sin desvío lateral
    expect(final.pos.y).toBeGreaterThan(0);
    expect(final.pos.y).toBeLessThan(2.44); // bajo el travesaño
  });

  it('contacto de comba desvía el cruce lateralmente (consistente)', () => {
    const curved = solveShot(input({ aim: { x: 0, y: 1.2 }, contact: { x: 0.9, y: 0 } }), {
      ballPos: ballPos(),
      kicker: DIEGO,
    });
    const { final } = traceTrajectory(curved, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });
    // Comba a la izquierda (−X) por el contacto derecho.
    expect(final.pos.x).toBeLessThan(-0.4);
  });
});
