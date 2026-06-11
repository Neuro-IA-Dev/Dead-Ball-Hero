import es from '@/data/locales/es.json';

/**
 * Sistema i18n mínimo — tarea 1.1b.
 *
 * Reglas (CLAUDE.md):
 * - ESPAÑOL es el idioma base y por defecto. Todos los textos viven en
 *   `src/data/locales/*.json`; PROHIBIDO hardcodear strings en componentes.
 * - Estructura lista para `en.json` desde el día 1 (inglés se completa en Fase 4).
 * - Detección automática del idioma del navegador con fallback a español.
 *
 * Uso:
 *   import { t, initI18n } from '@/core/i18n';
 *   initI18n();                       // detecta navegador, fija el locale
 *   t('app.title')                    // -> "DEAD BALL HERO"
 *   t('hud.attemptsLeft', { n: 3 })   // -> "Intentos: 3"
 */

export type LocaleCode = 'es' | 'en';

export const DEFAULT_LOCALE: LocaleCode = 'es';

type Messages = Record<string, unknown>;

/**
 * Bundles cargados. Solo `es` existe en el MVP; `en` se añadirá en Fase 4
 * (idealmente con import dinámico para no inflar el bundle base).
 */
const bundles: Partial<Record<LocaleCode, Messages>> = {
  es: es as Messages,
};

let current: LocaleCode = DEFAULT_LOCALE;

/** Idioma preferido del navegador, restringido a los que soportamos. */
export function detectLocale(): LocaleCode {
  const nav = (navigator.language || DEFAULT_LOCALE).toLowerCase();
  if (nav.startsWith('en')) return 'en';
  return 'es';
}

/**
 * Inicializa el locale a partir del navegador. Si el idioma detectado todavía
 * no tiene bundle cargado, cae a español. Devuelve el locale efectivo.
 */
export function initI18n(): LocaleCode {
  const detected = detectLocale();
  current = bundles[detected] ? detected : DEFAULT_LOCALE;
  document.documentElement.lang = current;
  return current;
}

export function getLocale(): LocaleCode {
  return current;
}

/** Cambia el locale activo si tiene bundle cargado; si no, lo ignora. */
export function setLocale(code: LocaleCode): boolean {
  if (!bundles[code]) return false;
  current = code;
  document.documentElement.lang = code;
  return true;
}

/** Resuelve una clave con punto ("a.b.c") dentro de un bundle. */
function resolve(bundle: Messages | undefined, key: string): string | undefined {
  if (!bundle) return undefined;
  let node: unknown = bundle;
  for (const part of key.split('.')) {
    if (typeof node === 'object' && node !== null && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/** Sustituye `{param}` por su valor; deja `{param}` crudo si falta. */
function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

/**
 * Traduce una clave. Cae al locale por defecto y, si tampoco existe, devuelve
 * la clave cruda (visible en QA, según LEVELS.md) y avisa por consola.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const raw =
    resolve(bundles[current], key) ?? resolve(bundles[DEFAULT_LOCALE], key);

  if (raw === undefined) {
    console.warn(`[i18n] clave faltante: "${key}"`);
    return key;
  }

  return params ? interpolate(raw, params) : raw;
}

/** True si la clave existe en el locale actual o en el de respaldo. */
export function tExists(key: string): boolean {
  return (
    resolve(bundles[current], key) !== undefined ||
    resolve(bundles[DEFAULT_LOCALE], key) !== undefined
  );
}
