# ROADMAP.md — DEAD BALL HERO

## Visión de progresión

El jugador empieza con ayudas máximas (línea de trayectoria larga, barrera quieta, arquero lento) y termina pateando como un pro: sin línea, con presión, viento y un solo intento. **La dificultad nunca viene de física injusta, sino de quitar ayudas y añadir presión.**

Economía: estrellas (1–3 por nivel) desbloquean actos; monedas (por gol, bonus por potencia perfecta y por ángulo) desbloquean pateadores, estadios y balones cosméticos.

---

## FASE 1 — MVP JUGABLE (objetivo de las primeras sesiones)

**Alcance estricto:**
- Escena Three.js: campo, arco reglamentario, barrera estática (cápsulas), arquero con reacción simple, pateador low-poly.
- Input: mouse/teclado + táctil básico (arrastre = apuntar, botón en pantalla = mantener-soltar potencia). Gamepad API si hay tiempo.
- Mecánica completa de UN tiro: apuntado por azimut con línea de proyección desde el balón (sin retícula en el arco), selección de contacto con puntero sobre el balón y etiqueta de tipo de golpe, barra de potencia ÚNICA de 5 segmentos (mantener-soltar, sin doble toque).
- Física Magnus calibrada con la receta de curva clásica (3 barras).
- 5 niveles del Acto 1 en JSON. Un pateador: **Diego**.
- HUD: marcador, intentos, mensaje de resultado, estrellas.
- Guardado en localStorage.

**Criterio de éxito:** la receta "alinear la línea al costado de la barrera + contacto de comba + soltar en 2.5-3 barras" mete gol consistentemente, y pasarse o quedarse corto de potencia castiga de forma justa y legible.

## FASE 2 — Los 6 tiros + roster + entrenador

- Grilla de contacto completa (trivela, knuckleball con flutter, caída, raso, debajo de barrera).
- Barrera que salta (probabilística), arquero con niveles de reacción.
- Pateadores: Roberto, David, Andrea, Juni — cada uno con stats, **firma visual** (carrera/pose reconocible, ver CLAUDE.md) y su capítulo con **Momento Legendario**.
- **Informe del Entrenador v1:** diagnóstico post-tiro desde datos del solver, textos por mentor (ver CLAUDE.md). Es la feature de entrenamiento prioritaria.
- **Mando Fantasma v1:** modo espejo (inputs en vivo sobre gamepad genérico) + modo fantasma (replay de tus inputs vs ejecución ideal).
- **Sistema de puntaje** con récord por nivel y umbrales de estrellas por puntos (ver CLAUDE.md y referencia visual).
- Sistema de "escenografía de momento": kits de colores evocativos sin escudos, clima (lluvia/noche), texto narrativo del contexto.
- Modo Práctica Libre (Mando Fantasma espejo + Informe del Entrenador siempre activos).
- Sticks virtuales con zona muerta configurable + vibración háptica.
- **Upgrade visual hacia `docs/ref-vision-dbh.png`:** multitud (impostors/sprites animados), pantalla de estadio con logo, banderas, HUD en paneles oscuros según la referencia, indicador de viento y panel de puntaje objetivo.

## FASE 3 — Carrera completa (50 niveles)

- Actos 2, 3 y 4 (ver diseño abajo). Escenarios de presión con marcador, reloj y narrativa.
- Pateadores restantes: Leo, Cris, Dinho, Sini. Jefe final: Rogério.
- Animaciones de carrera diferenciadas por pateador (la firma visual EN movimiento: carrera larga de Roberto, postura ancha de Cris, pausa de Leo).
- **Mando Fantasma v2 — modo Tutor:** el mando "juega solo" la receta del mentor antes de tu intento.
- Viento (modo arcade y Acto 4, con indicador m/s como en la referencia), estadios temáticos, repetición de goles.
- Audio completo: multitud reactiva, relator minimalista ("¡En el último minuto!").

## FASE 4 — Pulido y distribución

- Modo Minuto 93 arcade (rachas, leaderboard local de puntaje).
- **Localización completa a inglés (`en.json`)** para lanzamiento mundial; revisar que ningún texto quede fuera del sistema de locales (incluye todos los textos del Entrenador).
- PWA instalable (ícono, offline). Opcional: empaquetado Capacitor para tiendas.
- Soporte completo de mando físico en PC: el Mando Fantasma en espejo refleja el mando real conectado — practicas con TU mando.
- Balance final con telemetría local (tasa de gol por nivel objetivo: 60% acto 1, 35% acto 4).

## FASE 5 — Versus (jugadores reales)

- **v1 local por turnos (sin backend):** dos jugadores, mismo dispositivo, mismos 5 tiros (mismo nivel/viento/barrera); gana el puntaje. Pantalla de duelo con nombres y marcador.
- **v2 asíncrono por código de desafío:** exportas tu ronda (semilla del nivel + puntaje + grabación de inputs) como código/link; el rival la juega y compara; puede ver tu **replay fantasma** (tus inputs sobre el mando fantasma + tu balón como trazo fantasma en el mundo). Sin backend: el desafío viaja en el propio código/URL.
- **v3 online en tiempo real (requiere backend):** matchmaking, duelos al mejor de 5, torneos. Solo si v1/v2 validan la demanda; rompe la regla "sin backend" y se decide con el usuario.

---

## Diseño de los 4 actos (50 niveles)

### ACTO 1 — "La Academia" (niveles 1–10) · Mentor: Diego
Aprender la base sin presión. Línea de ayuda LARGA.
1. Sin barrera ni arquero: meterla en el arco (enseña potencia).
2. Sin barrera, arquero lento: esquinas (enseña apuntado).
3. Potencia perfecta obligatoria para la 3ª estrella (soltar la barra en el punto exacto del tiro).
4. Primera barrera, frontal, 20 m: por arriba con curva suave.
5. **Examen de Diego:** 3 goles en 5 intentos, 22 m frontal. → desbloquea Acto 2 y monedas.
6–10. Ángulos laterales, distancias 18–28 m, arquero normal, blancos en el arco (dianas en los ángulos) para estrellas.

### ACTO 2 — "La Gira" (niveles 11–25) · Mentores: David, Andrea, Roberto, Juni
Cada mentor abre un mini-capítulo de 3 niveles: enseña SU tiro con receta guiada, lo exige sin guía, y cierra con su **Momento Legendario** (recreación de su tiro histórico: misma distancia, ángulo, minuto y marcador, ambientación genérica con su firma visual y colores evocativos). Línea de ayuda MEDIA.
- 11–13 David: curva clásica al ángulo, palo lejano. Legendario: **"Minuto 93"** — 25 m, empate agónico para ir al Mundial. El nivel insignia del juego.
- 14–16 Andrea: la caída — por arriba de la barrera y que baje antes del travesaño. Legendario: **"La maldita"** a 30 m.
- 17–19 Roberto: trivela — apuntar AFUERA del palo y que vuelva. Legendario: **"La física rota del '97"**, 35 m frontales con comba imposible.
- 20–22 Juni: knuckleball 30–38 m, el arquero "lee mal" el flutter. Legendario: **"La noche de los 35 metros"**.
- 23–25 mixtos: el nivel dicta qué tiro usar (barrera que salta → raso por debajo; 38 m → knuckle).

### ACTO 3 — "Minuto 93" (niveles 26–40) · Mentores: Leo, Dinho, Cris
Presión narrativa: marcador en contra, reloj en 90'+, 1–2 intentos, multitud rugiendo. Línea de ayuda CORTA.
- Escenarios tipo: "Final de copa, 92', vas 0–1, tiro al borde del área, UN intento."
- "Clásico bajo lluvia, 89', empate, 2 intentos, barrera de 6 que salta."
- Capítulo Leo: finesse al palo lejano. Legendario: **"El misil al ángulo"** — semifinal continental, 30 m sobre el arquero.
- Capítulo Dinho: la barrera SIEMPRE salta — domina el raso por debajo. DOBLE Legendario: **"El globo de los 40 metros"** (el arquero está adelantado: hay que verlo y picarla por encima) y **"Por debajo de la barrera"**.
- Capítulo Cris: 35+ m, solo knuckle entra. Legendario: **"El cohete del 2008"**.
- Checkpoints cada 5 niveles; fallar el intento único = repetir desde checkpoint (tensión real).

### ACTO 4 — "Leyenda" (niveles 41–50) · Jefe: Rogério
SIN línea de ayuda (como un pro de verdad). Viento lateral visible con banderines.
- 41–44: remixes extremos de los 6 tiros con viento. Incluye el Legendario de Sini: **"El triplete del '98"** — 3 tiros libres distintos (curva, potencia, raso) en un mismo nivel.
- 45–47: "Ruleta": el juego sortea el tiro obligatorio.
- 48–49: dianas pequeñas en los ángulos, un intento. Incluye el Legendario de Diego: **"El ángulo imposible"** — tiro indirecto dentro del área con la barrera encima.
- 50. **JEFE: Rogério — "El centenario".** Duelo a 5 rondas: él ataja con reflejos máximos... y entre rondas PATEA él y tú defiendes la barrera eligiendo si salta o no (lectura de su animación). Ganas → título de Leyenda + Rogério jugable.

### Sistema de estrellas (todas las pantallas)
- ⭐ Gol · ⭐⭐ Gol con potencia perfecta · ⭐⭐⭐ Condición especial del nivel (diana, tiro específico, sin usar línea).

### Desbloqueables con monedas
- Pateadores fuera de su acto, estadios ("El Coloso", "La Bombilla", "Teatro del Norte"), balones (clásico blanco, "tango", "brazuca-like" genéricos), celebraciones.