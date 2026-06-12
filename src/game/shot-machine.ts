/**
 * Máquina de estados del tiro — tarea 1.5, reworkeada en 1.9b.1.
 *
 *   AIMING → CONTACT → POWERING → RUNUP → FLIGHT → RESULT → (reset) AIMING
 *
 * Replica la mecánica de la edición 26 del referente: UNA sola barra de
 * mantener-soltar, SIN timing verde (sin doble toque).
 *   - AIMING: el puntero apunta la dirección; DISPARO confirma.
 *   - CONTACT: el puntero elige el punto de golpeo; mantener DISPARO confirma
 *     el contacto y empieza a cargar la potencia.
 *   - POWERING: mientras se mantiene DISPARO la barra sube; al SOLTAR se fija
 *     la potencia. Si llega al tope sin soltar, dispara al máximo.
 *   - RUNUP: corre el pateador (~0.5–0.8 s según su firma) y golpea solo.
 *   - FLIGHT: la física toma el control (1.3/1.4).
 *   - RESULT: se muestra el desenlace; reset() vuelve a AIMING.
 *
 * Framework-free y testeable: no toca el DOM ni Three.js.
 *
 * NOTA (1.9b): el apuntado pasa a azimut en 1.9b.2 y el campo de timing sale de
 * la fórmula de dispersión en 1.9b.4. Hasta entonces `green` queda en true para
 * no introducir error tras quitar la fase TIMING.
 */

export type ShotPhase =
  | 'AIMING'
  | 'CONTACT'
  | 'POWERING'
  | 'RUNUP'
  | 'FLIGHT'
  | 'RESULT';

export interface AimTarget {
  /** Punto de la retícula sobre el plano del arco (z=0), en metros. */
  x: number;
  y: number;
}

export interface ContactPoint {
  /** Punto de golpeo, normalizado [-1,1]. X=lado, Y=alto/bajo. */
  x: number;
  y: number;
}

export interface ShotInput {
  aim: AimTarget;
  contact: ContactPoint;
  /** Potencia en barras [1..5] (fraccional). */
  power: number;
}

// --- Parámetros de potencia y carrera (calibrables en 1.18) ----------------

export const POWER_MIN = 1;
export const POWER_MAX = 5;
/** Tiempo (ms) de mantener DISPARO para llenar de 1 a 5 barras. */
export const POWER_FILL_MS = 1150;
/** Duración por defecto de la carrera del pateador (ms). */
export const DEFAULT_RUNUP_MS = 600;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class ShotMachine {
  private _phase: ShotPhase = 'AIMING';
  private _aim: AimTarget = { x: 0, y: 1.1 };
  private _contact: ContactPoint = { x: 0, y: 0 };

  private _power = POWER_MIN;
  private _holding = false;
  private _powerElapsed = 0;

  private _runupMs = DEFAULT_RUNUP_MS;
  private _runupElapsed = 0;

  /** Callback opcional al cambiar de fase (HUD/sonido). */
  onPhaseChange?: (phase: ShotPhase, prev: ShotPhase) => void;
  /** Callback al SOLTAR la potencia (para el feedback de potencia perfecta). */
  onPowerReleased?: (power: number) => void;

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
  /** Progreso de la carrera [0..1] (para la animación del pateador). */
  get runupProgress(): number {
    return clamp(this._runupElapsed / this._runupMs, 0, 1);
  }

  setRunupMs(ms: number): void {
    this._runupMs = Math.max(1, ms);
  }

  private setPhase(next: ShotPhase): void {
    if (next === this._phase) return;
    const prev = this._phase;
    this._phase = next;
    this.onPhaseChange?.(next, prev);
  }

  /** Fija la retícula (x,y en el plano del arco). Solo en AIMING.
   *  El clamp de rangos lo hace quien llama (Game). */
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
        this._holding = true;
        this._powerElapsed = 0;
        this._power = POWER_MIN;
        this.setPhase('POWERING');
        break;
      default:
        break;
    }
  }

  /** Soltar DISPARO (pointerup / Space up): fija potencia y arranca la carrera. */
  release(): void {
    if (this._phase === 'POWERING' && this._holding) {
      this.lockPowerAndRun();
    }
  }

  private lockPowerAndRun(): void {
    this._holding = false;
    this._runupElapsed = 0;
    this.onPowerReleased?.(this._power);
    this.setPhase('RUNUP');
  }

  /** Avanza relojes internos. `dtMs` en milisegundos. */
  update(dtMs: number): void {
    if (this._phase === 'POWERING' && this._holding) {
      this._powerElapsed += dtMs;
      const tNorm = clamp(this._powerElapsed / POWER_FILL_MS, 0, 1);
      this._power = POWER_MIN + tNorm * (POWER_MAX - POWER_MIN);
      // Tope sin soltar ⇒ dispara al máximo (igual que el referente).
      if (tNorm >= 1) this.lockPowerAndRun();
    } else if (this._phase === 'RUNUP') {
      this._runupElapsed += dtMs;
      if (this._runupElapsed >= this._runupMs) this.setPhase('FLIGHT');
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
    };
  }

  /** Sólo para modos internos/debug: precarga mira/contacto/potencia sin tocar fases. */
  seed(input: Partial<ShotInput>): void {
    if (input.aim) this._aim = { ...input.aim };
    if (input.contact) this._contact = { ...input.contact };
    if (typeof input.power === 'number') this._power = input.power;
  }

  /** Reinicia para el siguiente intento. Mantiene la mira anterior. */
  reset(): void {
    this._contact = { x: 0, y: 0 };
    this._power = POWER_MIN;
    this._holding = false;
    this._powerElapsed = 0;
    this._runupElapsed = 0;
    this.setPhase('AIMING');
  }
}
