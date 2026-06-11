import { BALL_RADIUS } from '@/core/field';

/**
 * Parámetros físicos del balón (CLAUDE.md) y tunables de calibración.
 * Todo lo que se ajusta en QA (1.18) vive aquí, documentado.
 */

export const MASS = 0.43; // kg
export const RADIUS = BALL_RADIUS; // 0.11 m
export const GRAVITY = 9.81; // m/s²
export const AIR_DENSITY = 1.225; // kg/m³ (nivel del mar)
export const AREA = Math.PI * RADIUS * RADIUS; // sección frontal (m²)

/**
 * Coeficiente Magnus S de Fm = S·(ω × v).
 * Calibrado (test 1.3) para que 3 barras (≈28 m/s) + curva máxima
 * (`MAX_CURVE_SPIN`) desplacen ~3 m lateralmente en 25 m de vuelo.
 * Sujeto a re-calibración fina en 1.18.
 */
export const MAGNUS_S = 0.00169;

/** Velocidad de salida por barras de potencia (CLAUDE.md: 1→18, 5→38 m/s). */
export const POWER_SPEED_MIN = 18;
export const POWER_SPEED_MAX = 38;

/** Convierte barras de potencia [1..5] (admite fraccional) a m/s. */
export function speedForPower(bars: number): number {
  const clamped = Math.max(1, Math.min(5, bars));
  const tNorm = (clamped - 1) / 4;
  return POWER_SPEED_MIN + tNorm * (POWER_SPEED_MAX - POWER_SPEED_MIN);
}

/**
 * Magnitud de spin (rad/s) de la "curva máxima" — eje vertical para comba
 * lateral. Referencia real: tiro libre con comba ~8–10 rev/s ≈ 50–63 rad/s.
 */
export const MAX_CURVE_SPIN = 60;

/** Spin típico de topspin/caída (eje horizontal lateral). */
export const MAX_TOPSPIN = 70;
