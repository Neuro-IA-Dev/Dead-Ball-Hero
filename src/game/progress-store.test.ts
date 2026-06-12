import { describe, it, expect, beforeEach } from 'vitest';
import { loadProgress, recordLevelResult, isUnlocked, starsFor } from '@/game/progress-store';

// localStorage en memoria para el entorno node de vitest.
class MemStore {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

describe('progress-store', () => {
  it('arranca vacío', () => {
    const p = loadProgress();
    expect(p.coins).toBe(0);
    expect(Object.keys(p.stars)).toHaveLength(0);
  });

  it('sube estrellas pero nunca baja', () => {
    recordLevelResult('a1-n01', 2, 50);
    recordLevelResult('a1-n01', 1, 50); // peor: no debe bajar
    expect(starsFor(loadProgress(), 'a1-n01')).toBe(2);
  });

  it('otorga monedas solo en el primer clear', () => {
    expect(recordLevelResult('a1-n01', 1, 50).coins).toBe(50);
    expect(recordLevelResult('a1-n01', 3, 50).coins).toBe(50); // sigue 50, no 100
  });

  it('desbloqueo en cadena por el nivel anterior', () => {
    const ids = ['a1-n01', 'a1-n02', 'a1-n03'];
    let p = loadProgress();
    expect(isUnlocked(p, ids, 0)).toBe(true);
    expect(isUnlocked(p, ids, 1)).toBe(false);
    p = recordLevelResult('a1-n01', 1, 50);
    expect(isUnlocked(p, ids, 1)).toBe(true);
    expect(isUnlocked(p, ids, 2)).toBe(false);
  });

  it('tolera datos corruptos', () => {
    localStorage.setItem('dbh:progress:v1', '{no es json');
    expect(loadProgress().coins).toBe(0);
  });
});
