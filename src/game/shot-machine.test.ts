import { describe, it, expect } from 'vitest';
import {
  ShotMachine,
  POWER_FILL_MS,
  TIMING_GREEN_CENTER_MS,
} from './shot-machine';

describe('ShotMachine — secuencia del tiro', () => {
  it('recorre AIMING→CONTACT→POWERING→TIMING→FLIGHT→RESULT', () => {
    const m = new ShotMachine();
    expect(m.phase).toBe('AIMING');

    m.setAim(1, 1.5);
    m.press(); // confirma mira
    expect(m.phase).toBe('CONTACT');

    m.setContact(0.5, -0.2);
    m.press(); // confirma contacto, empieza a cargar
    expect(m.phase).toBe('POWERING');

    m.update(POWER_FILL_MS / 2); // ~media barra de carga
    m.release();
    expect(m.phase).toBe('TIMING');
    expect(m.power).toBeGreaterThan(2);
    expect(m.power).toBeLessThan(4);

    m.update(TIMING_GREEN_CENTER_MS); // justo en el centro verde
    m.press();
    expect(m.phase).toBe('FLIGHT');
    expect(m.getInput().green).toBe(true);

    m.resolveFlight();
    expect(m.phase).toBe('RESULT');
  });

  it('cargar al máximo satura en 5 barras', () => {
    const m = new ShotMachine();
    m.press();
    m.press();
    m.update(POWER_FILL_MS * 2); // sobre-carga
    expect(m.power).toBeCloseTo(5, 5);
  });

  it('no pulsar en TIMING dispara con timing fallado', () => {
    const m = new ShotMachine();
    m.press();
    m.press();
    m.update(300);
    m.release();
    m.update(2000); // deja pasar todo el barrido
    expect(m.phase).toBe('FLIGHT');
    expect(m.getInput().green).toBe(false);
  });

  it('reset vuelve a AIMING y conserva la mira', () => {
    const m = new ShotMachine();
    m.setAim(2, 1.2);
    m.press();
    m.reset();
    expect(m.phase).toBe('AIMING');
    expect(m.aim).toEqual({ x: 2, y: 1.2 });
  });
});
