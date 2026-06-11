# CLAUDE.md — Master Prompt del Proyecto "DEAD BALL HERO"

## Qué es este proyecto

**DEAD BALL HERO** es un juego ligero (web, móvil + PC) que emula con fidelidad la mecánica de tiros libres del simulador de fútbol de consola más famoso del mundo (estilo PS5). El objetivo: que el jugador practique y domine TODOS los trucos de tiro libre conocidos (curva, knuckleball, trivela, caída, raso, debajo de la barrera) cuando no está en su consola, y se divierta superando escenarios de presión: partidos en el minuto final con 1 o 2 oportunidades de marcar.

**No es un juego de fútbol completo.** Es exclusivamente la experiencia del tiro libre, pulida al máximo.

**Misión doble:** (1) que marcar un gol aquí se sienta tan bien que den ganas del siguiente; (2) que cada sesión te haga objetivamente MEJOR pateando tiros libres en tu consola. Todo feature se evalúa contra esas dos preguntas.

## Referencia visual maestra

`docs/ref-vision-dbh.png` (aportada por el usuario) define el objetivo de look & feel: estadio nocturno low-poly vibrante con multitud densa, pateador low-poly estilizado (dorsal 10, sin rostro), pantalla del estadio con el logo DEAD BALL HERO, grilla de contacto verde bajo el balón con punto rojo, línea de proyección verde brillante con curva, etiqueta "CHANFLE CON EL INTERIOR DEL PIE" en franja oscura, y HUD inferior en panel oscuro: nivel + nombre + estadio (izq), intentos restantes, barra POTENCIA DEL TIRO de 5 segmentos numerados, mejor puntaje/récord, e indicador circular de EFECTO (der). Arriba: viento (m/s) y panel de PUNTAJE OBJETIVO con umbrales de estrellas. Apuntar a esa calidad — y superarla.

## El Mando Fantasma (feature insignia de entrenamiento)

Overlay opcional de un **gamepad genérico** semitransparente (esquina inferior o bajo el HUD) con dos sticks, gatillos y botones. Tres modos:
1. **Espejo (en vivo):** muestra en tiempo real los inputs del jugador traducidos a lenguaje de mando (stick izquierdo = mira, stick derecho = contacto/efecto, R2/DISPARO = potencia). En PC con mando físico conectado, refleja el mando real.
2. **Fantasma (post-tiro):** repite tus inputs Y superpone en otro color la ejecución ideal para ese tiro — ves tu stick y el stick fantasma lado a lado en el tiempo (dónde soltaste la potencia vs dónde debías).
3. **Tutor (pre-tiro, capítulos de mentor):** el mando fantasma "juega solo" mostrando la secuencia de la receta antes de que la intentes.

Legal: silueta de mando GENÉRICA (diseño propio, no la forma registrada de ningún fabricante); NUNCA usar los símbolos geométricos de botones de Sony (△◯✕□) ni nombres comerciales. Etiquetas L1/L2/R1/R2 + glifos propios son aceptables (convención de mandos genéricos de terceros).

## El Informe del Entrenador (feedback post-tiro)

Tras cada tiro (especialmente errados), una tarjeta breve y accionable, firmada por el mentor del capítulo con su personalidad, que diagnostica EN LENGUAJE DEL REFERENTE qué pasó y qué corregir. Reglas:
- Máximo 2 correcciones por tiro, la más impactante primero. Datos concretos, no vaguedades: "Soltaste en 3.8 barras; para chanfle desde 22 m suelta entre 2.5 y 3" / "Tu mira estaba 2 m dentro del arco; alinéala al costado de la barrera y deja que la comba haga el resto" / "Contacto muy abajo: el punto rojo debe ir al costado del balón para chanfle, no en la base".
- El diagnóstico sale de datos reales del solver (delta de potencia vs óptimo, posición de mira, zona de contacto, dispersión sufrida) — nunca mensajes aleatorios.
- En goles: refuerzo breve + qué hiciste bien ("Potencia perfecta. Eso mismo en tu consola.").
- Cada texto vive en `es.json` con variantes por mentor.

## Reglas legales INNEGOCIABLES

- NUNCA usar las palabras "FIFA", "EA", "FC 25", "PlayStation", "DualSense", nombres de clubes, ligas, escudos ni nombres completos de jugadores reales.
- Los jugadores se identifican SOLO por nombre de pila o apodo corto (ver Roster). Sus retratos son estilizados/genéricos (silueta, low-poly), nunca semejanza fotográfica.
- El mando virtual se llama "mando" o "control". Los botones usan la nomenclatura genérica: ✕ ◯ □ △ son válidos como símbolos geométricos genéricos, pero preferir etiquetas A/B/X/Y-neutras: `DISPARO`, `MOD1` (≈L1), `MOD2` (≈L2), `STICK-I`, `STICK-D`.
- Estadios ficticios con guiños: "El Coloso", "Viejo Parque", "La Bombilla", "Camp Viejo", "Teatro del Norte".
- **Momentos Legendarios (recreaciones):** se recrean tiros libres históricos SOLO mediante datos de juego (distancia, ángulo, minuto, marcador, clima) y ambientación genérica. Reglas: colores de camiseta evocativos SIN escudos ni patrocinadores (los colores no son marca); NUNCA nombrar torneos, selecciones, clubes ni rivales reales — usar descripciones ("una eliminatoria mundialista", "una final continental", "un clásico bajo la lluvia"); los textos dicen "inspirado en una noche legendaria", jamás citan el partido real.
- **Semejanza de jugadores:** siluetas low-poly estilizadas. Se permite capturar lo RECONOCIBLE por gesto, no por rostro: postura de carrera, largo de la carrera, pose previa al tiro, peinado como forma geométrica simple. Nada de caras realistas ni fotos de referencia en assets.

## Stack técnico

- **Three.js + Vite + TypeScript.** Sin frameworks de UI pesados; HUD en HTML/CSS overlay.
- Física propia (no motor de física externo): integración semi-implícita de Euler con gravedad, drag cuadrático y **efecto Magnus** (la curva). ~30 líneas de matemática, 60 fps.
- **Gamepad API** para mandos reales en PC (detectar mando tipo DualSense/Xbox).
- **Sticks virtuales táctiles** para móvil (nipplejs o implementación propia) + vibración háptica vía `navigator.vibrate`.
- Peso objetivo: **< 15 MB** total. Modelos low-poly (portería, barrera como cápsulas, portero, pateador), texturas procedurales o mínimas.
- Sin backend en MVP. Guardado en `localStorage` (progreso, estrellas, ajustes). NOTA: localStorage está bien aquí porque es una web app desplegada, NO un artifact de Claude.
- Audio: Web Audio API, sonidos cortos (golpe, red, palo, multitud) sintetizados o CC0.
- **Idiomas (i18n): ESPAÑOL es el idioma base y por defecto.** Todos los textos del juego viven en `src/data/locales/es.json` (nunca hardcodeados en componentes). Estructura lista para `en.json` desde el día 1; inglés se completa en Fase 4 para lanzamiento mundial. Detección automática del idioma del navegador con fallback a español.

## La mecánica core (fidelidad al referente de consola, edición 26)

> IMPORTANTE: la edición 26 del referente ELIMINÓ el "timing verde" (doble toque). El tiro es: apuntar → elegir contacto → mantener y SOLTAR una única barra. La maestría está en la potencia justa y en alinear la línea de proyección. Nuestro juego replica ESO.

Secuencia de un tiro libre:

1. **Apuntado (STICK-I / arrastre):** el stick izquierdo mueve una **retícula circular** (el punto estimado de caída del tiro) sobre el plano del arco — verificado contra el referente: la edición 26 SÍ muestra una mira circular de caída. **La cámara queda CASI FIJA detrás del balón**: solo acompaña a la retícula con un giro suave, amortiguado y limitado (nunca "gira el mundo"). Desde el balón sale la **línea de proyección** (verde, punteada) que muestra el primer tramo de la trayectoria real hacia la retícula, con la comba del contacto incluida; su largo depende del stat LÍNEA. El tamaño de la retícula crece con la dispersión esperada (potencia fuera de rango, PRE bajo). Regla de oro de feeling: **lo que se mueve al tocar el stick es LA MIRA y LA LÍNEA, jamás el escenario.**
2. **Selección de contacto (STICK-D / arrastre):** el selector vive **sobre el balón en el mundo 3D**, NO en un panel del HUD. Composición exacta (referencia: captura de la edición 26 aportada por el usuario, `docs/ref-contacto-fc26.png`): una **grilla romboidal verde semitransparente** (plano billboard inclinado, líneas finas) anclada al balón; un **punto rojo** que indica el punto de contacto y se mueve con el stick derecho o arrastre táctil; una **pequeña cruz/cursor** junto al punto; y abajo de la pantalla una **etiqueta en mayúsculas** con el tipo de golpe que cambia según la zona: "CHANFLE CON EL INTERIOR DEL PIE", "CHANFLE CON EL EXTERIOR DEL PIE", "PICADA", "RASO", "GOLPE NATURAL". La línea de proyección verde sale del balón y se actualiza en vivo con el contacto elegido. La barra de potencia es un elemento APARTE del HUD (abajo), nunca mezclada con el selector.
3. **Potencia (mantener y SOLTAR DISPARO):** UNA sola barra de 5 segmentos. Al soltar, la potencia queda fijada, arranca la carrera del pateador (~0.5–0.8 s según su firma visual) y golpea automáticamente. **No hay segundo toque.** Cada tipo de tiro tiene su rango óptimo; soltar dentro de ±0.15 barras del centro óptimo = **"potencia perfecta"** (la barra brilla, leve feedback háptico) → dispersión cero. Fuera del rango, la dispersión crece gradualmente (aliviada por PRE).
4. **Spin de refuerzo (opcional, STICK-D durante la carrera):** un gesto del stick derecho mientras el pateador corre acentúa la comba o la caída (~+20%). El gesto vertical abajo→arriba prepara el knuckle (Fase 2).
5. **Vuelo del balón:** cámara sigue el balón (tele broadcast). Repetición automática en goles desde detrás del arco.

### Recetas canónicas (deben funcionar tal cual en nuestro juego)

| Tiro | Receta | Rango ideal |
|---|---|---|
| Curva clásica | Línea alineada al costado/encima de la barrera, contacto lateral interior, **soltar en 2.5–3 barras** | 18–28 m |
| Caída (la "maldita") | Línea sobre la barrera, contacto arriba-centro, 2.5–3 barras | 20–30 m |
| Knuckleball | Contacto centro + gesto vertical, 2.5–3 barras | 28–40 m |
| Trivela | Línea ~un balón AFUERA del palo, contacto esquina inferior opuesta, 2–3 barras | 18–30 m |
| Raso esquinado | Contacto centro-abajo, 1.5–2.5 barras, esquina del arquero | borde del área |
| Debajo de la barrera | Raso con poca potencia (1.5 barras) cuando la barrera SALTA | borde del área |

La barrera salta con probabilidad según nivel; el tiro debajo de la barrera solo funciona si salta (igual que el referente). El arquero tiene tiempo de reacción paramétrico por nivel.

### Física del balón (parámetros base, calibrar en QA)

- Masa 0.43 kg, radio 0.11 m, gravedad 9.81.
- Drag: Cd ≈ 0.25 (alto spin) a 0.45 (knuckleball, régimen errático: añadir ruido lateral de baja frecuencia para el "flutter").
- Magnus: F = S(ω × v), S calibrado para que 3 barras + curva máxima desplacen ~3 m laterales en 25 m de vuelo.
- Velocidades: 1 barra ≈ 18 m/s, 5 barras ≈ 38 m/s.

## Roster de pateadores (nombre de pila únicamente)

Cada leyenda es **mentor de un tiro**: se desbloquea superando su capítulo y enseña su técnica. Stats: PRE (precisión), POT (potencia), CUR (curva), KNU (knuckle), LÍNEA (largo de línea de ayuda).

Cada uno tiene además una **firma visual** (carrera y pose reconocibles, sin rostro real) y un **Momento Legendario**: el nivel final de su capítulo, que recrea con datos fieles su tiro libre histórico en ambientación genérica.

| Nombre | Pie | Especialidad | Firma visual (carrera/pose) | Momento Legendario (recreación genérica) |
|---|---|---|---|---|
| **Diego** | Zurdo | Precisión colocada | Carrera corta, melena rizada, camiseta celeste y blanca | "El ángulo imposible": tiro indirecto DENTRO del área, barrera pegada, final continental del '86 |
| **Roberto** | Zurdo | Trivela de potencia | Carrera larguísima (10+ pasos), muslos enormes, camiseta amarilla | "La física rota del '97": 35 m frontales, trivela que dobla un metro afuera del palo y entra |
| **David** | Diestro | Curva clásica | Carrera diagonal elegante, camiseta blanca | "Minuto 93": empate agónico para ir al Mundial, 25 m, curva al ángulo — EL nivel insignia del juego |
| **Andrea** | Diestro | La caída "maldita" | Paso lento, barba, mirada baja, camiseta azul | "La maldita": 30 m, la pelota pica al ras del travesaño y baja |
| **Juni** | Diestro | Rey del knuckleball | Carrera de 3 pasos, camiseta blanca y roja | "La noche de los 35 metros": knuckle frontal lejano contra un gigante europeo, 2009 |
| **Leo** | Zurdo | Finesse quirúrgica | Pasos cortos, pausa antes de pegarle, camiseta azulgrana genérica | "El misil al ángulo": semifinal continental, 30 m al palo lejano sobre el arquero |
| **Cris** | Diestro | Knuckle moderno | Postura ancha de piernas, respiración, mentón arriba, camiseta roja | "El cohete del 2008": knuckle desde 30 m que el arquero ni ve |
| **Dinho** | Diestro | Por debajo / el globo | Sonrisa, cintura suelta, vincha | DOBLE momento: "El globo de los 40 metros" (arquero adelantado, 2002) y "Por debajo de la barrera que salta" (2006) |
| **Sini** | Zurdo | Potencia pura zurda | Carrera recta agresiva, camiseta celeste italiana | "El triplete del '98": 3 tiros libres distintos en un mismo nivel (curva, potencia, raso) |
| **Rogério** | Diestro | El arquero goleador — JEFE | Guantes puestos, sale corriendo desde su arco | "El centenario": duelo final — ataja tus 5 tiros y patea los suyos |

## Estructura del juego

- **Sistema de puntaje (visible en la referencia visual):** cada gol suma puntos: base por gol + bonus por potencia perfecta, por ángulo (diana), por distancia, por no usar línea de ayuda y por tiro exigido. Las estrellas del nivel pueden expresarse también como umbrales de puntaje (ej. 7.500 / 15.000 / 25.000) — las condiciones de LEVELS.md se mantienen y el puntaje las complementa. Mejor puntaje y récord por nivel persisten en localStorage. El puntaje es la moneda de comparación para el futuro versus.
- **Modo Carrera "Camino a la Leyenda":** 50 niveles en 4 actos (ver ROADMAP.md). Sistema de 1–3 estrellas por nivel, monedas para desbloquear pateadores, estadios y balones.
- **Modo Práctica Libre:** cualquier posición, sin presión, con Mando Fantasma en modo espejo e Informe del Entrenador tras cada tiro — el gimnasio puro.
- **Modo Minuto 93 (arcade):** escenarios aleatorios de presión, racha de supervivencia.
- **Modo Versus (futuro, Fase 5):** duelos entre jugadores reales. Primero local por turnos (mismo dispositivo: mismos 5 tiros, gana el puntaje); luego asíncrono (desafías con tu secuencia + replay fantasma de tus inputs para que el rival vea tu ejecución); tiempo real online queda para mucho después (requiere backend, rompe el "sin backend" del MVP).

## Convenciones de código

- TypeScript estricto. Carpetas: `src/core` (física, input), `src/game` (estados, niveles), `src/render` (Three.js), `src/ui` (HUD), `src/data` (niveles y jugadores en JSON).
- Los niveles son **data-driven**: un JSON define posición del balón, barrera, arquero, viento, intentos, marcador, condiciones de estrella. El esquema exacto vive en **LEVELS.md** (contrato innegociable). Nunca hardcodear niveles en lógica.
- Cada sesión de Claude Code: leer PROGRESS.md primero, implementar la siguiente tarea no marcada, actualizar PROGRESS.md al terminar, commit atómico con mensaje `feat|fix|chore: descripción`.
- Probar en viewport móvil (390×844) y desktop en cada feature de UI.
- Nada de assets con copyright. Sonidos CC0 o sintetizados.

## Definición de "hecho" para el MVP

Un visitante abre la URL en su teléfono o PC, elige a Diego, juega los 5 niveles del Acto 1, siente que la barra de potencia única, la línea de proyección y la curva responden como en su consola (edición 26), y quiere seguir jugando.