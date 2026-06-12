import { describe, it, expect } from 'vitest';
import { techniqueTipKey, postShotTipKey } from '@/game/coach';

describe('techniqueTipKey', () => {
  it('mapea cada tipo de tiro a su clave de técnica', () => {
    expect(techniqueTipKey('inside_curve')).toBe('coach.tech.inside_curve');
    expect(techniqueTipKey('driven_low')).toBe('coach.tech.driven_low');
    expect(techniqueTipKey('knuckle')).toBe('coach.tech.knuckle');
  });
});

describe('postShotTipKey', () => {
  const base = { perfectPower: false, powerDelta: 0, maxHeight: 1.5 };

  it('gol con potencia perfecta refuerza el aprendizaje', () => {
    expect(postShotTipKey({ ...base, event: 'GOAL', perfectPower: true })).toBe(
      'coach.post.goalPerfect',
    );
  });

  it('gol normal sugiere afinar la potencia', () => {
    expect(postShotTipKey({ ...base, event: 'GOAL' })).toBe('coach.post.goal');
  });

  it('atajada, palo y barrera tienen diagnóstico propio', () => {
    expect(postShotTipKey({ ...base, event: 'SAVED' })).toBe('coach.post.saved');
    expect(postShotTipKey({ ...base, event: 'POST' })).toBe('coach.post.post');
    expect(postShotTipKey({ ...base, event: 'CROSSBAR' })).toBe('coach.post.post');
    expect(postShotTipKey({ ...base, event: 'WALL' })).toBe('coach.post.wall');
  });

  it('afuera por altura real → "a las nubes"', () => {
    expect(postShotTipKey({ ...base, event: 'OUT', maxHeight: 3.1 })).toBe('coach.post.tooHigh');
  });

  it('exceso de potencia SIN altura (raso duro) → "demasiada fuerza", no "a las nubes"', () => {
    expect(postShotTipKey({ ...base, event: 'OUT', powerDelta: 0.8, maxHeight: 0.2 })).toBe(
      'coach.post.tooHard',
    );
  });

  it('afuera por poca potencia → "quedó corta"', () => {
    expect(postShotTipKey({ ...base, event: 'OUT', powerDelta: -0.9 })).toBe('coach.post.tooSoft');
  });

  it('afuera neutro → corregir la mira', () => {
    expect(postShotTipKey({ ...base, event: 'OUT' })).toBe('coach.post.out');
  });
});
