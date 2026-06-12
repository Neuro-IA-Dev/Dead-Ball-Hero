/**
 * Persistencia de progreso en localStorage — soporte de 1.16.
 * Guarda estrellas por nivel (id, nunca índice — LEVELS.md) y monedas. Tolerante
 * a datos corruptos (cae a progreso vacío) y nunca baja las estrellas ya logradas.
 */

const STORAGE_KEY = 'dbh:progress:v1';

export interface Progress {
  /** Mejor cantidad de estrellas (0..3) por id de nivel. */
  stars: Record<string, number>;
  coins: number;
}

function empty(): Progress {
  return { stars: {}, coins: 0 };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const stars: Record<string, number> = {};
    if (parsed.stars && typeof parsed.stars === 'object') {
      for (const [id, n] of Object.entries(parsed.stars)) {
        if (typeof n === 'number' && Number.isFinite(n)) {
          stars[id] = Math.max(0, Math.min(3, Math.round(n)));
        }
      }
    }
    const coins = typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) ? parsed.coins : 0;
    return { stars, coins };
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
): Progress {
  const p = loadProgress();
  const prev = p.stars[levelId] ?? 0;
  const firstClear = prev === 0 && stars > 0;
  if (stars > prev) p.stars[levelId] = stars;
  if (firstClear) p.coins += rewardCoins;
  save(p);
  return p;
}

export function starsFor(progress: Progress, levelId: string): number {
  return progress.stars[levelId] ?? 0;
}

/** Un nivel está desbloqueado si es el primero o el anterior tiene ≥1 estrella. */
export function isUnlocked(progress: Progress, levelIds: string[], index: number): boolean {
  if (index <= 0) return true;
  const prevId = levelIds[index - 1];
  return prevId != null && starsFor(progress, prevId) > 0;
}
