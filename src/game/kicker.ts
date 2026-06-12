/**
 * Pateadores — versión mínima para el MVP (tarea 1.6/1.9).
 * El roster completo y su carga desde datos llegan en 1.14; aquí solo Diego,
 * con los stats que afectan la línea de ayuda (1.6) y la dispersión (1.9).
 *
 * Stats 0–100 (CLAUDE.md): PRE precisión, POT potencia, CUR curva,
 * KNU knuckle. LÍNEA es la fracción [0..1] de la trayectoria que se previsualiza.
 */
/** Forma de pegarle / firma de carrera (afecta solo la animación del pateador). */
export type KickStyle = 'finesse' | 'power' | 'knuckle' | 'natural';

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
  /** Forma de pegarle: modula carrera, plantado y barrido de la pierna. */
  style: KickStyle;
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
  style: 'finesse', // colocada con el interior, carrera corta y diagonal
};

export const TRAINING_RIGHT_FOOT: Kicker = {
  ...DIEGO,
  id: 'training-right',
  foot: 'R',
  runupMs: 720, // carrera más larga
  style: 'power', // potencia con el empeine, carrera larga y recta
};

export const DAVID: Kicker = {
  id: 'david', foot: 'R', pre: 90, pot: 84, cur: 95, knu: 55, line: 0.8, runupMs: 720, style: 'natural',
};
export const ANDREA: Kicker = {
  id: 'andrea', foot: 'R', pre: 88, pot: 82, cur: 80, knu: 58, line: 0.8, runupMs: 680, style: 'natural',
};
export const DINHO: Kicker = {
  id: 'dinho', foot: 'R', pre: 86, pot: 80, cur: 88, knu: 72, line: 0.82, runupMs: 700, style: 'finesse',
};
export const ROBERTO: Kicker = {
  id: 'roberto', foot: 'L', pre: 80, pot: 96, cur: 86, knu: 50, line: 0.78, runupMs: 880, style: 'power',
};
export const JUNI: Kicker = {
  id: 'juni', foot: 'R', pre: 82, pot: 88, cur: 62, knu: 92, line: 0.78, runupMs: 700, style: 'knuckle',
};
export const LEO: Kicker = {
  id: 'leo', foot: 'L', pre: 94, pot: 78, cur: 93, knu: 66, line: 0.82, runupMs: 560, style: 'finesse',
};
export const CRIS: Kicker = {
  id: 'cris', foot: 'R', pre: 84, pot: 93, cur: 70, knu: 90, line: 0.78, runupMs: 760, style: 'knuckle',
};
export const SINI: Kicker = {
  id: 'sini', foot: 'L', pre: 83, pot: 95, cur: 80, knu: 55, line: 0.78, runupMs: 820, style: 'power',
};

/** Roster jugable de mentores (Q cicla entre ellos). Rogério (arquero) llega como jefe. */
export const ROSTER: Kicker[] = [DIEGO, DAVID, ANDREA, DINHO, LEO, JUNI, CRIS, ROBERTO, SINI];

export function kickerById(id: string): Kicker | undefined {
  return ROSTER.find((k) => k.id === id);
}

export const DEFAULT_KICKER = DIEGO;
