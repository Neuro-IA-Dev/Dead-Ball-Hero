# PROGRESS.md — DEAD BALL HERO

> Claude Code: lee CLAUDE.md y ROADMAP.md antes de tocar código. Implementa la siguiente tarea `[ ]` en orden, márcala `[x]` al terminar con fecha y nota breve. Un commit por tarea. Si una tarea revela trabajo extra, agrégalo como subtarea, no lo hagas en silencio.

## Estado actual
**Fase:** 1 — MVP
**Última sesión:** 2026-06-11 — Tareas 1.1 y 1.1b completadas (scaffold + i18n).
**Bloqueos:** ninguno
**Siguiente:** 1.2 (escena base: campo, arco, luces, cámara).
**Checkpoints de revisión con el usuario:** 1.9 (mapeo input→velocidad/spin) y 1.18 (calibración del feeling) se auditan juntos antes de cerrar Fase 1 — es donde se gana o pierde el "se siente como la consola". Avisar cuando haya algo jugable.

---

## FASE 1 — MVP

### Setup
- [x] 1.1 Inicializar proyecto Vite + TypeScript + Three.js. Estructura de carpetas según CLAUDE.md. ESLint básico. `npm run dev` funcionando. _(2026-06-11: Vite 8 + TS 6 estricto + three r184. Carpetas src/{core,game,render,ui,data/{levels,locales}}. Scripts: dev/build/preview/typecheck/lint. ESLint flat config. Alias `@`→src. main.ts es un placeholder (cubo girando) que se reemplaza en 1.2. typecheck+lint+build OK, `npm run dev`→HTTP 200.)_
- [x] 1.1b Sistema i18n mínimo: helper `t(clave)` + `src/data/locales/es.json` con TODOS los textos del juego desde el primer día (español por defecto, estructura lista para `en.json`). Prohibido hardcodear strings en componentes. _(2026-06-11: `core/i18n.ts` con `t(key, params)` (claves con punto + interpolación `{var}`), `detectLocale()` por navegador, fallback a es, clave cruda + warn si falta (regla LEVELS.md). `es.json` cubre app/menu/settings/hud/result/shot/stars/corner/weather/acts/kickers + los 5 niveles del Acto 1. `main.ts` fija el título vía `t('app.title')`. Estructura lista para `en.json` (Fase 4, idealmente import dinámico).)_
- [ ] 1.2 Escena base: campo (plano con textura procedural de césped), arco reglamentario 7.32×2.44 m con red (líneas), iluminación tipo estadio nocturno, cielo oscuro. Cámara detrás del punto de tiro.

### Física
- [ ] 1.3 Módulo `core/ballistics.ts`: integrador del balón con gravedad, drag y Magnus según parámetros de CLAUDE.md. Test unitario: con 3 barras y curva máxima, desplazamiento lateral ≈3 m a 25 m.
- [ ] 1.4 Colisiones: postes/travesaño (rebote), red (gol + frenado), suelo (rebote amortiguado), fuera (out). Eventos: `GOAL`, `POST`, `SAVED`, `WALL`, `OUT`.

### Input y mecánica de tiro
- [ ] 1.5 Máquina de estados del tiro: `AIMING → CONTACT_SELECT → POWERING → TIMING → FLIGHT → RESULT`.
- [ ] 1.6 Apuntado: retícula movible (mouse/táctil/teclado), línea de trayectoria parcial cuya longitud viene del stat LÍNEA del pateador.
- [ ] 1.7 Grilla de contacto simplificada MVP: eje X = curva izq/der, eje Y = elevación/raso. HUD del balón con indicador.
- [ ] 1.8 Barra de potencia de 5 segmentos (mantener/soltar) + ventana de timing verde (±80 ms) con feedback visual y sonoro.
- [ ] 1.9 Mapeo del resultado: (apuntado, contacto, potencia, timing) → velocidad inicial + spin. Error gaussiano que crece al fallar el verde y al exceder el rango óptimo de potencia. **⚑ REVISIÓN CON USUARIO** (auditar junto a 1.18).

### Mundo
- [ ] 1.10 Barrera estática: N cápsulas según JSON del nivel, colisión = `WALL`.
- [ ] 1.11 Arquero básico: reacción tras un delay paramétrico, se lanza hacia la intersección estimada; si llega, `SAVED` con animación simple.
- [ ] 1.12 Cámara de vuelo que sigue el balón + repetición corta del gol desde detrás del arco.

### Contenido y meta
- [ ] 1.13 Formato JSON de nivel + loader con validación, implementando EXACTAMENTE el esquema de **LEVELS.md**. Copiar los 5 niveles del Acto 1 y sus textos de locale desde ese archivo.
- [ ] 1.14 Pateador Diego con stats (PRE 95, POT 80, CUR 92, KNU 60, LÍNEA larga) afectando dispersión y línea de ayuda.
- [ ] 1.15 HUD completo: intentos, marcador/contexto del nivel, resultado, estrellas obtenidas, botones reintentar/siguiente.
- [ ] 1.16 Menú mínimo: título DEAD BALL HERO, selección de nivel (con candados y estrellas), persistencia en localStorage.
- [ ] 1.17 Audio mínimo: golpe al balón, palo, red, murmullo/explosión de multitud (Web Audio, sintetizado o CC0).
- [ ] 1.18 QA de feeling: calibrar hasta que la receta canónica de curva (CLAUDE.md) dé gol consistente con verde y falle de forma justa sin él. Documentar parámetros finales aquí. **⚑ REVISIÓN CON USUARIO** (auditar junto a 1.9 — "se siente como la consola").
- [ ] 1.19 Build de producción + deploy estático (Vercel/Netlify/GitHub Pages). Probar en un teléfono real.

## Backlog inmediato (Fase 2 — no empezar sin cerrar Fase 1)
- [ ] Gamepad API (mando físico en PC, mapeo estilo consola).
- [ ] Sticks virtuales táctiles con zona muerta configurable + vibración.
- [ ] Grilla de contacto completa: knuckleball (con flutter), trivela, caída, debajo de barrera.
- [ ] Barrera que salta + arquero por niveles.
- [ ] Modo Práctica Libre con overlay de inputs ("modo fantasma").

## Decisiones tomadas
- 2026-06-10: Motor Three.js web (no Frostbite/Unity/Godot) por peso y multiplataforma instantánea.
- 2026-06-10: Niveles 100% data-driven en JSON.
- 2026-06-10: Nombres de pila únicamente; cero marcas registradas.
- 2026-06-11: Nombre definitivo del juego: **DEAD BALL HERO**.
- 2026-06-11: Español como idioma base; i18n desde el día 1, inglés en Fase 4 (lanzamiento mundial).
- 2026-06-11: Momentos Legendarios: cada mentor cierra su capítulo recreando su tiro libre histórico (datos fieles, ambientación genérica, firma visual por gesto y colores, jamás nombres reales).

## Notas de QA / feeling
*(Claude Code: anota aquí cada ajuste de física o timing con su razón.)*