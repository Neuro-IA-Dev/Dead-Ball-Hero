import type { ShotEvent } from '@/core/collisions';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/core/field';

/**
 * Sistema de puntaje — la moneda de COMPETENCIA (récord por nivel, futuras
 * tablas y versus). Complementa a las estrellas (progresión/economía), no las
 * reemplaza. Lógica pura y testeable; refleja la referencia visual
 * ("PUNTAJE OBJETIVO" con bonus por potencia, ángulo, distancia y sin línea).
 */

export interface ScoreInput {
  event: ShotEvent;
  perfectPower: boolean;
  usedAidLine: boolean;
  /** Distancia del balón al arco (m). */
  distance: number;
  cross?: { x: number; y: number } | null;
  /** El balón rebotó en un tubo y entró igual (palo y adentro). */
  postIn?: boolean;
}

export interface ScoreBreakdown {
  base: number;
  perfect: number;
  angle: number;
  distance: number;
  noAid: number;
  postIn: number;
  total: number;
}

const ZERO: ScoreBreakdown = { base: 0, perfect: 0, angle: 0, distance: 0, noAid: 0, postIn: 0, total: 0 };

const BASE_GOAL = 1000;
const PERFECT_BONUS = 500;
const NO_AID_BONUS = 300;
const POST_IN_BONUS = 600; // "del palo y adentro": tiro al límite, se premia fuerte
const DISTANCE_FROM_M = 16; // a partir de aquí premia la distancia
const DISTANCE_PER_M = 30;
const MAX_ANGLE_BONUS = 500;
const CORNER_RADIUS = 1.6; // m: cuán cerca de la esquina cuenta como "diana"

/** Puntaje de un tiro. Solo los goles puntúan. */
export function computeShotScore(s: ScoreInput): ScoreBreakdown {
  if (s.event !== 'GOAL') return { ...ZERO };

  const base = BASE_GOAL;
  const perfect = s.perfectPower ? PERFECT_BONUS : 0;
  const noAid = s.usedAidLine ? 0 : NO_AID_BONUS;
  const postIn = s.postIn ? POST_IN_BONUS : 0;
  const distance = Math.round(Math.max(0, s.distance - DISTANCE_FROM_M) * DISTANCE_PER_M);

  let angle = 0;
  if (s.cross) {
    const toPost = Math.max(0, GOAL_HALF_WIDTH - Math.abs(s.cross.x));
    const toBarOrGround = Math.max(0, Math.min(GOAL_HEIGHT - s.cross.y, s.cross.y));
    const cornerDist = Math.hypot(toPost, toBarOrGround);
    const proximity = Math.max(0, 1 - cornerDist / CORNER_RADIUS);
    angle = Math.round(proximity * MAX_ANGLE_BONUS);
  }

  return {
    base,
    perfect,
    angle,
    distance,
    noAid,
    postIn,
    total: base + perfect + noAid + postIn + distance + angle,
  };
}
