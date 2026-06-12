/**
 * Persistencia de progreso en localStorage — soporte de 1.16.
 * Guarda estrellas por nivel (id, nunca índice — LEVELS.md) y monedas. Tolerante
 * a datos corruptos (cae a progreso vacío) y nunca baja las estrellas ya logradas.
 */

const STORAGE_KEY = 'dbh:progress:v1';

export interface Progress {
  /** Mejor cantidad de estrellas (0..3) por id de nivel. */
  stars: Record<string, number>;
  /** Mejor puntaje por id de nivel (récord, moneda de competencia). */
  scores: Record<string, number>;
  coins: number;
}

function empty(): Progress {
  return { stars: {}, scores: {}, coins: 0 };
}

function parseNumberMap(value: unknown, clampMax?: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object') {
    for (const [id, n] of Object.entries(value as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) {
        const v = Math.max(0, Math.round(n));
        out[id] = clampMax != null ? Math.min(clampMax, v) : v;
      }
    }
  }
  return out;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const stars = parseNumberMap(parsed.stars, 3);
    const scores = parseNumberMap(parsed.scores);
    const coins = typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) ? parsed.coins : 0;
    return { stars, scores, coins };
  } catch {
    return empty();
  }
}

function save(p: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento lleno o no disponible: ignorar (no romper el juego) */
  }
}

/**
 * Registra el resultado de un nivel. Solo sube las estrellas (nunca baja) y suma
 * las monedas de recompensa la PRIMERA vez que se logra ≥1 estrella en el nivel.
 * Devuelve el progreso actualizado.
 */
export function recordLevelResult(
  levelId: string,
  stars: number,
  rewardCoins: number,
  score = 0,
): Progress {
  const p = loadProgress();
  const prev = p.stars[levelId] ?? 0;
  const firstClear = prev === 0 && stars > 0;
  if (stars > prev) p.stars[levelId] = stars;
  if (score > (p.scores[levelId] ?? 0)) p.scores[levelId] = score;
  if (firstClear) p.coins += rewardCoins;
  save(p);
  return p;
}

export function starsFor(progress: Progress, levelId: string): number {
  return progress.stars[levelId] ?? 0;
}

export function bestScoreFor(progress: Progress, levelId: string): number {
  return progress.scores[levelId] ?? 0;
}

/** Un nivel está desbloqueado si es el primero o el anterior tiene ≥1 estrella. */
export function isUnlocked(progress: Progress, levelIds: string[], index: number): boolean {
  if (index <= 0) return true;
  const prevId = levelIds[index - 1];
  return prevId != null && starsFor(progress, prevId) > 0;
}
