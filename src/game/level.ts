import act1 from '@/data/levels/act1.json';
import { tExists } from '@/core/i18n';

/**
 * Formato de nivel + loader con validación — tarea 1.13.
 * Implementa EXACTAMENTE el esquema de LEVELS.md (contrato innegociable).
 * Coordenadas: origen en el centro de la línea de gol; +X derecha del arquero,
 * +Z hacia el campo, +Y arriba; metros. Arco x∈[-3.66,3.66], alto 2.44.
 */

export type KickType =
  | 'curva'
  | 'caida'
  | 'knuckle'
  | 'trivela'
  | 'raso'
  | 'bajo_barrera'
  | 'globo';

export type Corner = 'TL' | 'TR' | 'BL' | 'BR';

export type StarCondition =
  | { type: 'perfect_power' }
  | { type: 'target'; corner: Corner; radius: number }
  | { type: 'no_aid_line' }
  | { type: 'kick'; kick: KickType }
  | { type: 'all_attempts' };

export interface LevelScenario {
  minute: number;
  scoreHome: number;
  scoreAway: number;
  playerIsHome: boolean;
  weather: 'clear' | 'rain' | 'night';
  crowdIntensity: 0 | 1 | 2 | 3;
}

export interface LevelWall {
  players: number;
  distance: number;
  jumpChance: number;
}

export interface LevelKeeper {
  reactionMs: number;
  diveSpeed: number;
  offLine?: number;
}

export interface LevelSpec {
  id: string;
  act: 1 | 2 | 3 | 4;
  order: number;
  nameKey: string;
  briefKey: string;
  ball: { x: number; z: number };
  attempts: number;
  goalsNeeded: number;
  scenario?: LevelScenario;
  wall: LevelWall | null;
  keeper: LevelKeeper | null;
  wind?: { x: number; z: number };
  aidLineOverride?: number;
  requiredKick?: KickType;
  forcedKicker?: string;
  stars: { two: StarCondition; three: StarCondition };
  rewardCoins: number;
  legendaryMoment?: boolean;
}

const KICK_TYPES: readonly KickType[] = [
  'curva',
  'caida',
  'knuckle',
  'trivela',
  'raso',
  'bajo_barrera',
  'globo',
];
const CORNERS: readonly Corner[] = ['TL', 'TR', 'BL', 'BR'];

class LevelError extends Error {
  constructor(id: string, field: string, detail: string) {
    super(`Nivel "${id}" inválido — ${field}: ${detail}`);
    this.name = 'LevelError';
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateStar(id: string, where: string, s: unknown): StarCondition {
  if (typeof s !== 'object' || s === null) throw new LevelError(id, where, 'no es objeto');
  const cond = s as Record<string, unknown>;
  switch (cond.type) {
    case 'perfect_power':
    case 'no_aid_line':
    case 'all_attempts':
      return { type: cond.type };
    case 'target':
      if (!CORNERS.includes(cond.corner as Corner)) {
        throw new LevelError(id, `${where}.corner`, `esquina inválida: ${String(cond.corner)}`);
      }
      if (!isNum(cond.radius)) throw new LevelError(id, `${where}.radius`, 'falta radio');
      return { type: 'target', corner: cond.corner as Corner, radius: cond.radius };
    case 'kick':
      if (!KICK_TYPES.includes(cond.kick as KickType)) {
        throw new LevelError(id, `${where}.kick`, `tiro inválido: ${String(cond.kick)}`);
      }
      return { type: 'kick', kick: cond.kick as KickType };
    default:
      throw new LevelError(id, where, `tipo desconocido: ${String(cond.type)}`);
  }
}

/** Valida un nivel contra el esquema; lanza LevelError con el campo culpable. */
export function validateLevel(raw: unknown): LevelSpec {
  if (typeof raw !== 'object' || raw === null) throw new Error('Nivel no es objeto');
  const l = raw as Record<string, unknown>;
  const id = typeof l.id === 'string' ? l.id : '(sin id)';

  if (typeof l.id !== 'string') throw new LevelError(id, 'id', 'falta o no es string');
  if (l.act !== 1 && l.act !== 2 && l.act !== 3 && l.act !== 4) {
    throw new LevelError(id, 'act', 'debe ser 1..4');
  }
  if (!isNum(l.order)) throw new LevelError(id, 'order', 'falta');
  if (typeof l.nameKey !== 'string') throw new LevelError(id, 'nameKey', 'falta');
  if (typeof l.briefKey !== 'string') throw new LevelError(id, 'briefKey', 'falta');
  if (!tExists(l.nameKey)) console.warn(`[level] ${id}: nameKey sin traducir: ${l.nameKey}`);
  if (!tExists(l.briefKey)) console.warn(`[level] ${id}: briefKey sin traducir: ${l.briefKey}`);

  const ball = l.ball as Record<string, unknown> | undefined;
  if (!ball || !isNum(ball.x) || !isNum(ball.z)) throw new LevelError(id, 'ball', 'falta x/z');
  if (ball.z <= 0) throw new LevelError(id, 'ball.z', 'debe estar delante del arco (z>0)');
  if (!isNum(l.attempts) || l.attempts < 1) throw new LevelError(id, 'attempts', '>=1');
  if (!isNum(l.goalsNeeded) || l.goalsNeeded < 1) throw new LevelError(id, 'goalsNeeded', '>=1');
  if ((l.goalsNeeded as number) > (l.attempts as number)) {
    throw new LevelError(id, 'goalsNeeded', 'no puede superar attempts');
  }

  if (l.wall !== null && l.wall !== undefined) {
    const w = l.wall as Record<string, unknown>;
    if (!isNum(w.players) || !isNum(w.distance) || !isNum(w.jumpChance)) {
      throw new LevelError(id, 'wall', 'players/distance/jumpChance');
    }
  }
  if (l.keeper !== null && l.keeper !== undefined) {
    const k = l.keeper as Record<string, unknown>;
    if (!isNum(k.reactionMs) || !isNum(k.diveSpeed)) {
      throw new LevelError(id, 'keeper', 'reactionMs/diveSpeed');
    }
  }
  if (!isNum(l.rewardCoins)) throw new LevelError(id, 'rewardCoins', 'falta');

  const stars = l.stars as Record<string, unknown> | undefined;
  if (!stars) throw new LevelError(id, 'stars', 'falta');
  validateStar(id, 'stars.two', stars.two);
  validateStar(id, 'stars.three', stars.three);

  return raw as LevelSpec;
}

/** Carga y valida una lista de niveles crudos. */
export function parseLevels(raw: unknown): LevelSpec[] {
  if (!Array.isArray(raw)) throw new Error('La lista de niveles no es un array');
  return raw.map(validateLevel).sort((a, b) => a.order - b.order);
}

let cached: LevelSpec[] | null = null;

/** Niveles del Acto 1 (MVP), validados una sola vez. */
export function getCampaignLevels(): LevelSpec[] {
  if (!cached) cached = parseLevels(act1);
  return cached;
}

export function getLevelById(id: string): LevelSpec | undefined {
  return getCampaignLevels().find((l) => l.id === id);
}
