/**
 * Máquina de estados del tiro — tarea 1.5.
 *
 *   AIMING → CONTACT → POWERING → TIMING → FLIGHT → RESULT → (reset) AIMING
 *
 * Conduce la secuencia del tiro libre del referente de consola:
 *   - AIMING: el puntero mueve la mira; DISPARO confirma.
 *   - CONTACT: el puntero elige el punto de golpeo en la grilla; mantener
 *     DISPARO confirma el contacto y empieza a cargar la potencia.
 *   - POWERING: mientras se mantiene DISPARO la barra sube; al soltar se fija.
 *   - TIMING: una marca barre; volver a pulsar DISPARO en la ventana verde.
 *   - FLIGHT: la física toma el control (1.3/1.4).
 *   - RESULT: se muestra el desenlace; reset() vuelve a AIMING.
 *
 * Esta clase es framework-free y testeable: no toca el DOM ni Three.js.
 * Los parámetros de potencia/timing (1.8) viven aquí porque son estado del tiro.
 */

export type ShotPhase =
  | 'AIMING'
  | 'CONTACT'
  | 'POWERING'
  | 'TIMING'
  | 'FLIGHT'
  | 'RESULT';

export interface AimTarget {
  /** Punto objetivo sobre el plano del arco (metros). */
  x: number;
  y: number;
}

export interface ContactPoint {
  /** Grilla de contacto, normalizada [-1,1]. X=curva izq/der, Y=elevación/raso. */
  x: number;
  y: number;
}

export interface ShotInput {
  aim: AimTarget;
  contact: ContactPoint;
  /** Potencia en barras [1..5] (fraccional). */
  power: number;
  /** Error de timing en ms respecto al centro de la ventana verde (con signo). */
  timingErrorMs: number;
  /** True si el timing cayó dentro de la ventana verde. */
  green: boolean;
}

// --- Parámetros de potencia y timing (1.8; calibrables en 1.18) ------------

export const POWER_MIN = 1;
export const POWER_MAX = 5;
/** Tiempo (ms) de mantener DISPARO para llenar de 1 a 5 barras. */
export const POWER_FILL_MS = 1150;

/** Duración del barrido de timing (ms). */
export const TIMING_SWEEP_MS = 1000;
/** Centro de la ventana verde dentro del barrido (ms). */
export const TIMING_GREEN_CENTER_MS = 640;
/** Semiancho de la ventana verde: ±80 ms (CLAUDE.md). */
export const TIMING_GREEN_HALF_MS = 80;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class ShotMachine {
  private _phase: ShotPhase = 'AIMING';
  private _aim: AimTarget = { x: 0, y: 1.0 };
  private _contact: ContactPoint = { x: 0, y: 0 };

  private _power = POWER_MIN;
  private _holding = false;
  private _powerElapsed = 0;

  private _timingElapsed = 0;
  private _timingErrorMs = TIMING_SWEEP_MS; // peor caso por defecto
  private _green = false;
  private _timingCaptured = false;

  /** Callback opcional al cambiar de fase (HUD/sonido). */
  onPhaseChange?: (phase: ShotPhase, prev: ShotPhase) => void;

  get phase(): ShotPhase {
    return this._phase;
  }
  get aim(): AimTarget {
    return this._aim;
  }
  get contact(): ContactPoint {
    return this._contact;
  }
  get power(): number {
    return this._power;
  }
  /** Progreso del barrido de timing [0..1] (para el HUD). */
  get timingProgress(): number {
    return clamp(this._timingElapsed / TIMING_SWEEP_MS, 0, 1);
  }

  private setPhase(next: ShotPhase): void {
    if (next === this._phase) return;
    const prev = this._phase;
    this._phase = next;
    this.onPhaseChange?.(next, prev);
  }

  setAim(x: number, y: number): void {
    if (this._phase !== 'AIMING') return;
    this._aim = { x, y };
  }

  setContact(x: number, y: number): void {
    if (this._phase !== 'CONTACT') return;
    this._contact = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  /** Pulsación de DISPARO (pointerdown / Space down). */
  press(): void {
    switch (this._phase) {
      case 'AIMING':
        this.setPhase('CONTACT');
        break;
      case 'CONTACT':
        // Confirma contacto y empieza a cargar potencia.
        this._holding = true;
        this._powerElapsed = 0;
        this._power = POWER_MIN;
        this.setPhase('POWERING');
        break;
      case 'TIMING':
        this.captureTiming();
        break;
      default:
        break;
    }
  }

  /** Soltar DISPARO (pointerup / Space up). */
  release(): void {
    if (this._phase === 'POWERING' && this._holding) {
      this._holding = false;
      this._timingElapsed = 0;
      this._timingCaptured = false;
      this.setPhase('TIMING');
    }
  }

  private captureTiming(): void {
    if (this._timingCaptured) return;
    this._timingCaptured = true;
    this._timingErrorMs = this._timingElapsed - TIMING_GREEN_CENTER_MS;
    this._green = Math.abs(this._timingErrorMs) <= TIMING_GREEN_HALF_MS;
    this.setPhase('FLIGHT');
  }

  /** Avanza relojes internos. `dtMs` en milisegundos. */
  update(dtMs: number): void {
    if (this._phase === 'POWERING' && this._holding) {
      this._powerElapsed += dtMs;
      const tNorm = clamp(this._powerElapsed / POWER_FILL_MS, 0, 1);
      this._power = POWER_MIN + tNorm * (POWER_MAX - POWER_MIN);
    } else if (this._phase === 'TIMING') {
      this._timingElapsed += dtMs;
      if (this._timingElapsed >= TIMING_SWEEP_MS && !this._timingCaptured) {
        // No pulsó a tiempo: dispara con el peor timing posible.
        this._timingErrorMs = TIMING_SWEEP_MS;
        this._green = false;
        this._timingCaptured = true;
        this.setPhase('FLIGHT');
      }
    }
  }

  /** Llamar cuando la física resuelve el vuelo. */
  resolveFlight(): void {
    if (this._phase === 'FLIGHT') this.setPhase('RESULT');
  }

  getInput(): ShotInput {
    return {
      aim: this._aim,
      contact: this._contact,
      power: this._power,
      timingErrorMs: this._timingErrorMs,
      green: this._green,
    };
  }

  /** Reinicia para el siguiente intento. Mantiene la mira anterior. */
  reset(): void {
    this._contact = { x: 0, y: 0 };
    this._power = POWER_MIN;
    this._holding = false;
    this._powerElapsed = 0;
    this._timingElapsed = 0;
    this._timingErrorMs = TIMING_SWEEP_MS;
    this._green = false;
    this._timingCaptured = false;
    this.setPhase('AIMING');
  }
}
