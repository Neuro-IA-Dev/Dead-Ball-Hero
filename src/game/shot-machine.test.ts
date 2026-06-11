import { describe, it, expect } from 'vitest';
import {
  ShotMachine,
  POWER_FILL_MS,
  DEFAULT_RUNUP_MS,
  AZIMUTH_LIMIT,
} from './shot-machine';

describe('ShotMachine — secuencia del tiro (edición 26, sin timing)', () => {
  it('recorre AIMING→CONTACT→POWERING→RUNUP→FLIGHT→RESULT', () => {
    const m = new ShotMachine();
    expect(m.phase).toBe('AIMING');

    m.setAzimuth(0.2);
    m.press(); // confirma mira
    expect(m.phase).toBe('CONTACT');

    m.setContact(0.5, -0.2);
    m.press(); // confirma contacto, empieza a cargar
    expect(m.phase).toBe('POWERING');

    m.update(POWER_FILL_MS / 2); // ~media barra de carga
    m.release(); // suelta: fija potencia y arranca la carrera
    expect(m.phase).toBe('RUNUP');
    expect(m.power).toBeGreaterThan(2);
    expect(m.power).toBeLessThan(4);

    m.update(DEFAULT_RUNUP_MS); // termina la carrera → golpeo automático
    expect(m.phase).toBe('FLIGHT');

    m.resolveFlight();
    expect(m.phase).toBe('RESULT');
  });

  it('mantener hasta el tope dispara al máximo sin soltar', () => {
    const m = new ShotMachine();
    m.press();
    m.press();
    m.update(POWER_FILL_MS * 1.2); // sobrepasa el tope sin soltar
    expect(m.power).toBeCloseTo(5, 5);
    expect(m.phase).toBe('RUNUP'); // disparó solo
  });

  it('onPowerReleased reporta la potencia al soltar', () => {
    const m = new ShotMachine();
    let released = -1;
    m.onPowerReleased = (p) => (released = p);
    m.press();
    m.press();
    m.update(POWER_FILL_MS / 4); // ~2 barras
    m.release();
    expect(released).toBeGreaterThan(1.5);
    expect(released).toBeLessThan(2.5);
  });

  it('respeta un runup personalizado del pateador', () => {
    const m = new ShotMachine();
    m.setRunupMs(300);
    m.press();
    m.press();
    m.update(200);
    m.release();
    expect(m.phase).toBe('RUNUP');
    m.update(310);
    expect(m.phase).toBe('FLIGHT');
  });

  it('reset vuelve a AIMING y conserva el azimut', () => {
    const m = new ShotMachine();
    m.setAzimuth(0.3);
    m.press();
    m.reset();
    expect(m.phase).toBe('AIMING');
    expect(m.aim).toEqual({ azimuth: 0.3 });
  });

  it('el azimut se limita a ±AZIMUTH_LIMIT y nudge es relativo', () => {
    const m = new ShotMachine();
    m.setAzimuth(10);
    expect(m.aim.azimuth).toBeCloseTo(AZIMUTH_LIMIT, 5);
    m.setAzimuth(0);
    m.nudgeAzimuth(0.1);
    m.nudgeAzimuth(0.1);
    expect(m.aim.azimuth).toBeCloseTo(0.2, 5);
  });
});
