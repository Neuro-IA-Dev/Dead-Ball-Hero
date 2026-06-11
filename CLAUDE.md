# CLAUDE.md — Master Prompt del Proyecto "DEAD BALL HERO"

## Qué es este proyecto

**DEAD BALL HERO** es un juego ligero (web, móvil + PC) que emula con fidelidad la mecánica de tiros libres del simulador de fútbol de consola más famoso del mundo (estilo PS5). El objetivo: que el jugador practique y domine TODOS los trucos de tiro libre conocidos (curva, knuckleball, trivela, caída, raso, debajo de la barrera) cuando no está en su consola, y se divierta superando escenarios de presión: partidos en el minuto final con 1 o 2 oportunidades de marcar.

**No es un juego de fútbol completo.** Es exclusivamente la experiencia del tiro libre, pulida al máximo.

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

## La mecánica core (fidelidad al simulador de consola)

Secuencia de un tiro libre, idéntica al referente:

1. **Apuntado (STICK-I / arrastre táctil):** una retícula/cámara detrás del pateador apunta al arco. Se muestra una **línea de trayectoria parcial** cuya longitud depende del nivel de "Dead Ball" del jugador (jugadores expertos ven más línea; es la mecánica real del referente y nuestra palanca de dificultad).
2. **Grilla de contacto (STICK-D):** un balón grande en HUD con una grilla 3×3+. La posición del stick derecho sobre el balón define el tipo de golpe:
   - Centro-arriba → **caída/topspin** (pica y baja)
   - Lateral interior → **curva con empeine interno** (finesse)
   - Esquina inferior opuesta al pie → **trivela** (curva exterior)
   - Centro exacto + movimiento arriba-abajo → **knuckleball** (sin rotación, vuelo errático)
   - Centro-abajo → **raso/driven**
3. **Potencia (mantener DISPARO):** barra de 5 segmentos. Cada tipo de tiro tiene su rango óptimo (ver recetas).
4. **Timing verde (soltar + re-presionar DISPARO en ventana):** ventana de timing perfecto que aumenta precisión y reduce error. Ventana verde de ±80 ms (ajustable por dificultad).
5. **Vuelo del balón:** cámara sigue el balón (cámara "tele broadcast"). Repetición automática en goles con cámara alternativa.

### Recetas canónicas (deben funcionar tal cual en nuestro juego)

| Tiro | Receta | Rango ideal |
|---|---|---|
| Curva clásica | Apuntar al costado del palo, contacto lateral interior, **3 barras**, timing verde | 18–28 m |
| Caída (la "maldita") | Apuntar al ángulo, contacto arriba-centro, 2.5–3 barras | 20–30 m |
| Knuckleball | Apuntar levemente desviado, contacto centro con gesto vertical, 2.5–3 barras + verde | 28–40 m |
| Trivela | Apuntar ~un balón AFUERA del palo, contacto esquina inferior opuesta, 2–3 barras | 18–30 m |
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

- **Modo Carrera "Camino a la Leyenda":** 50 niveles en 4 actos (ver ROADMAP.md). Sistema de 1–3 estrellas por nivel, monedas para desbloquear pateadores, estadios y balones.
- **Modo Práctica Libre:** cualquier posición, sin presión, con overlay de inputs ("modo fantasma") que muestra qué hiciste con los sticks y la barra — herramienta de aprendizaje clave.
- **Modo Minuto 93 (arcade):** escenarios aleatorios de presión, racha de supervivencia.

## Convenciones de código

- TypeScript estricto. Carpetas: `src/core` (física, input), `src/game` (estados, niveles), `src/render` (Three.js), `src/ui` (HUD), `src/data` (niveles y jugadores en JSON).
- Los niveles son **data-driven**: un JSON define posición del balón, barrera, arquero, viento, intentos, marcador, condiciones de estrella. El esquema exacto vive en **LEVELS.md** (contrato innegociable). Nunca hardcodear niveles en lógica.
- Cada sesión de Claude Code: leer PROGRESS.md primero, implementar la siguiente tarea no marcada, actualizar PROGRESS.md al terminar, commit atómico con mensaje `feat|fix|chore: descripción`.
- Probar en viewport móvil (390×844) y desktop en cada feature de UI.
- Nada de assets con copyright. Sonidos CC0 o sintetizados.

## Definición de "hecho" para el MVP

Un visitante abre la URL en su teléfono o PC, elige a Diego, juega los 5 niveles del Acto 1, siente que la barra de potencia, el timing verde y la curva responden como en su consola, y quiere seguir jugando.