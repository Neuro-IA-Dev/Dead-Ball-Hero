import { describe, it, expect } from 'vitest';
import { validateLevel, parseLevels, getCampaignLevels } from '@/game/level';

const base = {
  id: 'a1-n01',
  act: 1,
  order: 1,
  nameKey: 'levels.a1n01.name',
  briefKey: 'levels.a1n01.brief',
  ball: { x: 0, z: 18 },
  attempts: 5,
  goalsNeeded: 1,
  wall: null,
  keeper: null,
  rewardCoins: 50,
  stars: { two: { type: 'perfect_power' }, three: { type: 'all_attempts' } },
};

describe('validateLevel', () => {
  it('acepta un nivel bien formado', () => {
    expect(validateLevel(base).id).toBe('a1-n01');
  });

  it('rechaza act fuera de 1..4 con el campo culpable', () => {
    expect(() => validateLevel({ ...base, act: 7 })).toThrow(/act/);
  });

  it('rechaza goalsNeeded > attempts', () => {
    expect(() => validateLevel({ ...base, goalsNeeded: 9 })).toThrow(/goalsNeeded/);
  });

  it('rechaza balón detrás del arco (z<=0)', () => {
    expect(() => validateLevel({ ...base, ball: { x: 0, z: -2 } })).toThrow(/ball\.z/);
  });

  it('rechaza condición de estrella desconocida', () => {
    expect(() =>
      validateLevel({ ...base, stars: { two: { type: 'magia' }, three: { type: 'all_attempts' } } }),
    ).toThrow(/stars\.two/);
  });

  it('rechaza esquina de target inválida', () => {
    expect(() =>
      validateLevel({
        ...base,
        stars: { two: { type: 'target', corner: 'ZZ', radius: 1 }, three: { type: 'all_attempts' } },
      }),
    ).toThrow(/corner/);
  });
});

describe('parseLevels / campaña', () => {
  it('ordena por order', () => {
    const parsed = parseLevels([
      { ...base, id: 'b', order: 2 },
      { ...base, id: 'a', order: 1 },
    ]);
    expect(parsed.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('carga los 5 niveles del Acto 1', () => {
    const levels = getCampaignLevels();
    expect(levels).toHaveLength(5);
    expect(levels[0]!.id).toBe('a1-n01');
    expect(levels[4]!.id).toBe('a1-n05');
  });
});
