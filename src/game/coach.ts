import type { ShotType } from '@/game/shot-model';
import type { ShotEvent } from '@/core/collisions';

/**
 * Capa de entrenamiento — "aprende la técnica real mientras juegas".
 *
 * Dos funciones puras que devuelven CLAVES de i18n (nunca texto): el consejo de
 * técnica del tipo de tiro actual (mientras apuntas) y el diagnóstico breve del
 * resultado (tras rematar). El texto vive en `es.json` bajo `coach.*`.
 *
 * El diagnóstico sale de datos reales del solver/vuelo (evento, potencia vs
 * óptimo, altura máxima), nunca de mensajes aleatorios (CLAUDE.md).
 */

/** Consejo de técnica del tipo de tiro que se está preparando. */
export function techniqueTipKey(shotType: ShotType): string {
  return `coach.tech.${shotType}`;
}

export interface PostShotInput {
  event: ShotEvent;
  /** Soltó dentro de la ventana de "potencia perfecta". */
  perfectPower: boolean;
  /** power − idealPower (con signo): >0 te pasaste, <0 te quedaste corto. */
  powerDelta: number;
  /** Altura máxima alcanzada en el vuelo (m). */
  maxHeight: number;
}

const TOO_HIGH_M = 2.6;
const POWER_OFF_BARS = 0.5;

/** Nota del tiro (estilo "A+" de la referencia), del resultado y la ejecución. */
export function shotGrade(event: ShotEvent, perfectPower: boolean): string {
  switch (event) {
    case 'GOAL':
      return perfectPower ? 'A+' : 'B';
    case 'POST':
    case 'CROSSBAR':
    case 'SAVED':
      return 'C';
    default:
      return 'D';
  }
}

/** Diagnóstico de una línea tras el tiro, accionable y basado en datos. */
export function postShotTipKey(p: PostShotInput): string {
  switch (p.event) {
    case 'GOAL':
      return p.perfectPower ? 'coach.post.goalPerfect' : 'coach.post.goal';
    case 'SAVED':
      return 'coach.post.saved';
    case 'POST':
    case 'CROSSBAR':
      return 'coach.post.post';
    case 'WALL':
      return 'coach.post.wall';
    case 'OUT':
    default:
      // "A las nubes" SOLO si de verdad voló alto (no por exceso de potencia
      // en un raso, que sale duro y bajo, no por arriba).
      if (p.maxHeight > TOO_HIGH_M) return 'coach.post.tooHigh';
      if (p.powerDelta > POWER_OFF_BARS) return 'coach.post.tooHard';
      if (p.powerDelta < -POWER_OFF_BARS) return 'coach.post.tooSoft';
      return 'coach.post.out';
  }
}
