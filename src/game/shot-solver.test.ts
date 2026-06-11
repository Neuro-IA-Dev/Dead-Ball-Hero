import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  solveShot,
  classifyContact,
  contactToSpin,
  dispersionSigma,
  shotDirection,
  elevationFor,
  optimalPowerCenter,
  isPerfectPower,
} from './shot-solver';
import { DIEGO } from './kicker';
import type { ShotInput } from './shot-machine';
import { traceTrajectory, DEFAULT_DRAG_CD } from '@/core/ballistics';

const ballPos = () => new THREE.Vector3(0, 0.11, 20);

function input(over: Partial<ShotInput> = {}): ShotInput {
  return {
    aim: { azimuth: 0 },
    contact: { x: 0, y: 0 },
    power: optimalPowerCenter({ x: 0, y: 0 }, DIEGO), // normal: perfecto
    ...over,
  };
}

describe('shot-solver — clasificación de contacto (Diego, zurdo)', () => {
  it('clasifica por zona y pie', () => {
    expect(classifyContact({ x: 0.9, y: 0 }, DIEGO)).toBe('chanfle_exterior');
    expect(classifyContact({ x: -0.9, y: 0 }, DIEGO)).toBe('chanfle_interior');
    expect(classifyContact({ x: 0, y: 0.9 }, DIEGO)).toBe('picada');
    expect(classifyContact({ x: 0, y: -0.9 }, DIEGO)).toBe('raso');
    expect(classifyContact({ x: 0, y: 0 }, DIEGO)).toBe('normal');
  });
});

describe('shot-solver — helpers', () => {
  it('shotDirection: azimut 0 va al arco (−Z); azimut + desvía a +X', () => {
    const straight = shotDirection(ballPos(), 0, 0.2);
    expect(straight.z).toBeLessThan(0);
    expect(Math.abs(straight.x)).toBeLessThan(1e-9);
    const right = shotDirection(ballPos(), 0.2, 0.2);
    expect(right.x).toBeGreaterThan(0);
  });

  it('elevationFor crece con contacto.Y', () => {
    const lo = elevationFor('normal', -0.5, 3);
    const hi = elevationFor('normal', 0.5, 3);
    expect(hi).toBeGreaterThan(lo);
  });

  it('contacto derecha ⇒ spin.y>0 (comba); arriba ⇒ spin.x<0 (caída)', () => {
    expect(contactToSpin({ x: 0.8, y: 0 }, DIEGO).y).toBeGreaterThan(0);
    expect(contactToSpin({ x: 0, y: 0.8 }, DIEGO).x).toBeLessThan(0);
  });

  it('potencia perfecta ⇒ dispersión 0; fuera de la ventana ⇒ >0', () => {
    expect(isPerfectPower(2.75, { x: 0, y: 0 }, DIEGO)).toBe(true);
    expect(dispersionSigma(input(), DIEGO)).toBe(0);
    expect(dispersionSigma(input({ power: 5 }), DIEGO)).toBeGreaterThan(0);
  });

  it('mayor precisión ⇒ menor dispersión ante el mismo error de potencia', () => {
    const sharp = dispersionSigma(input({ power: 5 }), { ...DIEGO, pre: 95 });
    const sloppy = dispersionSigma(input({ power: 5 }), { ...DIEGO, pre: 40 });
    expect(sloppy).toBeGreaterThan(sharp);
  });
});

describe('shot-solver — vuelo', () => {
  it('tiro perfecto (recto, potencia óptima) es determinista y entra al arco', () => {
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
    const contact = { x: 0.9, y: 0 };
    const power = optimalPowerCenter(contact, DIEGO); // perfecto ⇒ determinista
    const curved = solveShot(input({ contact, power }), {
      ballPos: ballPos(),
      kicker: DIEGO,
    });
    const { final } = traceTrajectory(curved, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });
    // Comba a la izquierda (−X) por el contacto en el lado derecho del balón.
    expect(final.pos.x).toBeLessThan(-0.4);
  });
});
