/**
 * Geometría del campo y el arco — fuente de verdad compartida (render + física).
 *
 * Sistema de coordenadas (LEVELS.md):
 *   - Origen en el CENTRO de la línea de gol.
 *   - +X a la derecha del arquero (mirando al campo).
 *   - +Z hacia el campo (el balón se patea desde z>0 hacia z=0).
 *   - +Y hacia arriba.
 *   - Unidades: metros.
 */

/** Arco reglamentario: 7.32 m de ancho × 2.44 m de alto. */
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const GOAL_HALF_WIDTH = GOAL_WIDTH / 2; // 3.66
export const POST_RADIUS = 0.06; // ~12 cm de diámetro
export const GOAL_DEPTH = 1.8; // profundidad de la red hacia -Z

/** Plano de la línea de gol. */
export const GOAL_LINE_Z = 0;

/** Radio del balón (CLAUDE.md). */
export const BALL_RADIUS = 0.11;

/** Límite del campo jugable hacia +Z (para detectar "out" por largo). */
export const FIELD_DEPTH = 60;
export const FIELD_HALF_WIDTH = 34; // medio ancho de cancha aprox.
