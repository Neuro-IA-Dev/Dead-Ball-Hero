/**
 * Pateadores — versión mínima para el MVP (tarea 1.6/1.9).
 * El roster completo y su carga desde datos llegan en 1.14; aquí solo Diego,
 * con los stats que afectan la línea de ayuda (1.6) y la dispersión (1.9).
 *
 * Stats 0–100 (CLAUDE.md): PRE precisión, POT potencia, CUR curva,
 * KNU knuckle. LÍNEA es la fracción [0..1] de la trayectoria que se previsualiza.
 */
export interface Kicker {
  id: string;
  foot: 'L' | 'R';
  pre: number; // precisión
  pot: number; // potencia
  cur: number; // curva
  knu: number; // knuckle
  /** Largo de la línea de ayuda, fracción [0..1] del vuelo previsualizado. */
  line: number;
  /** Duración de la carrera (ms) antes del golpeo — firma visual del pateador. */
  runupMs: number;
}

export const DIEGO: Kicker = {
  id: 'diego',
  foot: 'L',
  pre: 95,
  pot: 80,
  cur: 92,
  knu: 60,
  line: 0.85, // "línea larga" (Acto 1, máxima ayuda)
  runupMs: 600, // carrera corta (CLAUDE.md: firma visual de Diego)
};

export const TRAINING_RIGHT_FOOT: Kicker = {
  ...DIEGO,
  id: 'training-right',
  foot: 'R',
};

export const DEFAULT_KICKER = DIEGO;
