import { describe, it, expect } from 'vitest';
import { LevelSession, evaluateGoalCondition, shotTypeToKick, type ShotOutcome } from '@/game/level-session';
import type { LevelSpec } from '@/game/level';

function level(partial: Partial<LevelSpec>): LevelSpec {
  return {
    id: 'test',
    act: 1,
    order: 1,
    nameKey: 'n',
    briefKey: 'b',
    ball: { x: 0, z: 20 },
    attempts: 3,
    goalsNeeded: 1,
    wall: null,
    keeper: null,
    rewardCoins: 10,
    stars: { two: { type: 'perfect_power' }, three: { type: 'all_attempts' } },
    ...partial,
  };
}

const goal = (o: Partial<ShotOutcome> = {}): ShotOutcome => ({
  event: 'GOAL',
  perfectPower: false,
  shotType: 'natural',
  usedAidLine: true,
  cross: { x: 0, y: 1 },
  ...o,
});

describe('shotTypeToKick', () => {
  it('mapea curvas, caída, raso y knuckle', () => {
    expect(shotTypeToKick('inside_curve')).toBe('curva');
    expect(shotTypeToKick('outside_curve')).toBe('curva');
    expect(shotTypeToKick('topspin')).toBe('caida');
    expect(shotTypeToKick('driven_low')).toBe('raso');
    expect(shotTypeToKick('knuckle')).toBe('knuckle');
    expect(shotTypeToKick('natural')).toBeNull();
  });
});

describe('evaluateGoalCondition', () => {
  it('solo cuenta en goles', () => {
    expect(evaluateGoalCondition({ type: 'perfect_power' }, goal({ event: 'OUT', perfectPower: true }))).toBe(false);
  });
  it('target dentro del radio de la esquina', () => {
    const cond = { type: 'target', corner: 'TR', radius: 1.0 } as const;
    expect(evaluateGoalCondition(cond, goal({ cross: { x: 3.66, y: 2.44 } }))).toBe(true);
    expect(evaluateGoalCondition(cond, goal({ cross: { x: 0, y: 1 } }))).toBe(false);
  });
  it('kick específico', () => {
    expect(evaluateGoalCondition({ type: 'kick', kick: 'curva' }, goal({ shotType: 'inside_curve' }))).toBe(true);
    expect(evaluateGoalCondition({ type: 'kick', kick: 'raso' }, goal({ shotType: 'inside_curve' }))).toBe(false);
  });
});

describe('LevelSession', () => {
  it('1ª estrella = superar el nivel', () => {
    const s = new LevelSession(level({ attempts: 3, goalsNeeded: 1 }));
    const st = s.recordShot(goal());
    expect(st.passed).toBe(true);
    expect(st.stars).toBe(1);
  });

  it('2ª estrella con potencia perfecta', () => {
    const s = new LevelSession(level({ attempts: 3, goalsNeeded: 1 }));
    const st = s.recordShot(goal({ perfectPower: true }));
    expect(st.stars).toBe(2);
  });

  it('3ª estrella all_attempts: convertir TODOS los intentos', () => {
    const s = new LevelSession(level({ attempts: 2, goalsNeeded: 1 }));
    s.recordShot(goal({ perfectPower: true }));
    const st = s.recordShot(goal({ perfectPower: true }));
    expect(st.finished).toBe(true);
    expect(st.stars).toBe(3);
  });

  it('un fallo rompe all_attempts pero conserva las otras estrellas', () => {
    const s = new LevelSession(level({ attempts: 2, goalsNeeded: 1 }));
    s.recordShot(goal({ perfectPower: true }));
    const st = s.recordShot({ ...goal(), event: 'SAVED' });
    expect(st.passed).toBe(true);
    expect(st.stars).toBe(2); // 1 (pasó) + 2ª (perfecta), no la 3ª
  });

  it('marca failed si se acaban los intentos sin alcanzar los goles', () => {
    const s = new LevelSession(level({ attempts: 1, goalsNeeded: 1 }));
    const st = s.recordShot({ ...goal(), event: 'OUT' });
    expect(st.failed).toBe(true);
    expect(st.stars).toBe(0);
  });
});
