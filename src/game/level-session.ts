import type { ShotEvent } from '@/core/collisions';
import type { ShotType } from '@/game/shot-model';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/core/field';
import type { Corner, KickType, LevelSpec, StarCondition } from '@/game/level';

/**
 * Sesión de un nivel y evaluación de estrellas — soporte de 1.15.
 * Lógica pura (sin DOM/Three): el controlador la alimenta con el resultado de
 * cada tiro y consulta el estado para el HUD. La 1ª estrella siempre es superar
 * el nivel; la 2ª y 3ª salen de las condiciones del JSON (LEVELS.md).
 */

export interface ShotOutcome {
  event: ShotEvent;
  perfectPower: boolean;
  shotType: ShotType;
  usedAidLine: boolean;
  cross?: { x: number; y: number } | null;
}

/** Mapea el tipo interno de tiro al KickType del esquema de niveles. */
export function shotTypeToKick(shotType: ShotType): KickType | null {
  switch (shotType) {
    case 'inside_curve':
    case 'outside_curve':
      return 'curva';
    case 'topspin':
      return 'caida';
    case 'driven_low':
      return 'raso';
    case 'knuckle':
      return 'knuckle';
    default:
      return null;
  }
}

function cornerPoint(corner: Corner): { x: number; y: number } {
  const x = corner === 'TL' || corner === 'BL' ? -GOAL_HALF_WIDTH : GOAL_HALF_WIDTH;
  const y = corner === 'TL' || corner === 'TR' ? GOAL_HEIGHT : 0;
  return { x, y };
}

/** Evalúa una condición de estrella POR GOL (las de sesión devuelven false). */
export function evaluateGoalCondition(cond: StarCondition, outcome: ShotOutcome): boolean {
  if (outcome.event !== 'GOAL') return false;
  switch (cond.type) {
    case 'perfect_power':
      return outcome.perfectPower;
    case 'no_aid_line':
      return !outcome.usedAidLine;
    case 'kick':
      return shotTypeToKick(outcome.shotType) === cond.kick;
    case 'target': {
      if (!outcome.cross) return false;
      const c = cornerPoint(cond.corner);
      return Math.hypot(outcome.cross.x - c.x, outcome.cross.y - c.y) <= cond.radius;
    }
    case 'all_attempts':
      return false; // condición de sesión, no por gol
    default:
      return false;
  }
}

export interface SessionStatus {
  attemptsLeft: number;
  attemptsTotal: number;
  goalsScored: number;
  goalsNeeded: number;
  stars: number;
  passed: boolean;
  finished: boolean;
  failed: boolean;
}

export class LevelSession {
  readonly level: LevelSpec;
  attemptsLeft: number;
  goalsScored = 0;
  private metTwo = false;
  private metThree = false;
  private missed = false;

  constructor(level: LevelSpec) {
    this.level = level;
    this.attemptsLeft = level.attempts;
  }

  get passed(): boolean {
    return this.goalsScored >= this.level.goalsNeeded;
  }

  /** Procesa el resultado de un tiro. Devuelve el estado tras consumir el intento. */
  recordShot(outcome: ShotOutcome): SessionStatus {
    this.attemptsLeft = Math.max(0, this.attemptsLeft - 1);
    if (outcome.event === 'GOAL') {
      this.goalsScored += 1;
      if (evaluateGoalCondition(this.level.stars.two, outcome)) this.metTwo = true;
      if (evaluateGoalCondition(this.level.stars.three, outcome)) this.metThree = true;
    } else {
      this.missed = true;
    }
    return this.status();
  }

  private conditionMet(cond: StarCondition, perGoalMet: boolean): boolean {
    if (cond.type === 'all_attempts') {
      return !this.missed && this.attemptsLeft === 0 && this.goalsScored === this.level.attempts;
    }
    return perGoalMet;
  }

  stars(): number {
    if (!this.passed) return 0;
    let n = 1;
    if (this.conditionMet(this.level.stars.two, this.metTwo)) n += 1;
    if (this.conditionMet(this.level.stars.three, this.metThree)) n += 1;
    return n;
  }

  status(): SessionStatus {
    // Termina al agotar intentos o cuando ya es imposible alcanzar los goles.
    const doomed = !this.passed && this.goalsScored + this.attemptsLeft < this.level.goalsNeeded;
    const finished = this.attemptsLeft <= 0 || doomed;
    return {
      attemptsLeft: this.attemptsLeft,
      attemptsTotal: this.level.attempts,
      goalsScored: this.goalsScored,
      goalsNeeded: this.level.goalsNeeded,
      stars: this.stars(),
      passed: this.passed,
      finished,
      failed: finished && !this.passed,
    };
  }
}
