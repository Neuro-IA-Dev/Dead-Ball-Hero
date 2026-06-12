import { describe, it, expect } from 'vitest';
import { computeShotScore } from '@/game/score';

const goal = (o: Partial<Parameters<typeof computeShotScore>[0]> = {}) =>
  computeShotScore({
    event: 'GOAL',
    perfectPower: false,
    usedAidLine: true,
    distance: 16,
    cross: { x: 0, y: 1.2 },
    ...o,
  });

describe('computeShotScore', () => {
  it('un no-gol no puntúa', () => {
    expect(computeShotScore({ event: 'OUT', perfectPower: true, usedAidLine: false, distance: 30 }).total).toBe(0);
  });

  it('gol base sin bonus', () => {
    expect(goal().base).toBe(1000);
    expect(goal().total).toBe(1000);
  });

  it('potencia perfecta suma bonus', () => {
    expect(goal({ perfectPower: true }).perfect).toBe(500);
  });

  it('sin línea de ayuda suma bonus', () => {
    expect(goal({ usedAidLine: false }).noAid).toBe(300);
  });

  it('la distancia premia más lejos', () => {
    expect(goal({ distance: 16 }).distance).toBe(0);
    expect(goal({ distance: 26 }).distance).toBe(300);
  });

  it('el ángulo premia los rincones, no el centro', () => {
    const corner = goal({ cross: { x: 3.5, y: 2.3 } }).angle;
    const center = goal({ cross: { x: 0, y: 1.2 } }).angle;
    expect(corner).toBeGreaterThan(center);
    expect(center).toBe(0);
  });

  it('palo y adentro suma bonus fuerte', () => {
    expect(goal({ postIn: true }).postIn).toBe(600);
    expect(goal({ postIn: true }).total).toBe(1600);
    expect(goal({ postIn: false }).postIn).toBe(0);
  });

  it('suma todos los bonus', () => {
    const s = goal({ perfectPower: true, usedAidLine: false, distance: 26, cross: { x: 3.6, y: 2.4 } });
    expect(s.total).toBe(s.base + s.perfect + s.noAid + s.distance + s.angle);
    expect(s.total).toBeGreaterThan(2000);
  });
});
