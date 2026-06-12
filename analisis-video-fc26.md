# Análisis del video de referencia — FC26 tiros libres (tarea 1.9c.0)

> Fuentes: **`docs/15-58-40.mp4`** (grabación de pantalla de un tutorial de YouTube del referente real, 1920×1080 @ 24.08 fps, 65.4 s) + **`docs/ref-vision-dbh1.png`** (mockup de visión de NUESTRO juego, HUD nítido). Regla: el video manda sobre la spec escrita.
>
> **Limitaciones del video (importante):** es un tutorial hablado dentro del reproductor de YouTube (chrome del navegador alrededor) y con un **widget "Grabación de pantalla HD" que ocluye permanentemente el centro-abajo** — justo donde están el balón, la grilla de contacto y la barra de potencia. Además hay compresión de YouTube. Por eso: la **composición, el comportamiento de cámara y la secuencia del gol** son medibles con confianza; los **tiempos finos** (px/frame de la mira, llenado de la barra, frames exactos de carrera) NO son fiables aquí y se marcan como *estimado → confirmar en vivo*. El HUD fino se toma del mockup `ref-vision-dbh1.png`.

## Método

- ffmpeg 8.1.1 instalado (winget Gyan.FFmpeg).
- Timeline a 1 fps (`docs/frames/t_*.png`), bursts a fps nativo recortados a la región del juego (`crop=1170:600:30:122`).
- Detección de cambios de escena (`select='gt(scene,0.12)')`: acción en **t≈12.3, 21.3, 22.9, 47.5, 60.8 s**; el resto es apuntado/explicación continua.

## 1. Composición de cámara (CONFIABLE)

- **Cámara baja, casi a ras**, detrás y ligeramente al costado del pateador. **MUY cercana al pateador**: el pateador (#18) aparece GRANDE, ocupando el tercio inferior-izquierdo del cuadro (torso/espalda bien visibles).
- **Balón**: en el borde inferior-central (cerca de los pies del pateador, parte baja del cuadro).
- **Barrera**: defensores en la franja media, centrados.
- **Arco**: centrado al fondo, pequeño (distancia mostrada ~22 m). Arquero centrado.
- **Multitud**: llena el tercio superior. FOV aparente medio-amplio (~50–55°).
- ⇒ Corrección vs build actual: la cámara debe estar **más cerca y más baja** (pateador grande en el tercio izquierdo), no lejana/alta.

## 2. Qué se mueve al apuntar (CONFIABLE en lo cualitativo)

- Durante varios segundos de apuntado la **escena permanece ESTÁTICA**: el fondo (arco, barrera, multitud) NO rota ni orbita. Lo que se mueve es la mira/retícula, no el mundo.
- ⇒ **Corrección fuerte de 1.9c.2:** el seguimiento de cámara debe ser **casi nulo** (la escena no debe girar perceptiblemente al apuntar). Bajar `CAM_FOLLOW_FACTOR` a ~0.05 y topes a ±3° yaw / ±2° pitch (o 0 follow). Regla de oro confirmada por el video.
- Velocidad de la mira en px/frame: **no medible** (el tutorial no muestra un barrido limpio; mira ocluida). Estimación de diseño: cruzar el ancho del arco en ~1.0–1.3 s, respuesta con rampa para precisión fina → confirmar en vivo.

## 3. Retícula y línea de proyección (del mockup `ref-vision-dbh1.png`; coherente con el video)

- **Línea verde punteada** que sale DEL BALÓN, **se curva por encima/al costado de la barrera y TERMINA dentro del arco**, en el ángulo apuntado. La comba está incluida en la línea.
- **Retícula = punto de caída real** (al final de la línea curva), un **círculo/anillo verde con cruz** en el plano del arco. Junto a ella, "ALTURA ESTIMADA 2.08 m".
- ⇒ **Confirma el modelo de 1.9c.6 (apuntado al destino con comba incluida):** la retícula es el DESTINO y el solver curva el camino hasta ella. La comba NO desvía la retícula; curva la trayectoria hacia ella. (Mi fix en vuelo iba bien encaminado.)
- Color línea/retícula: **verde** (~#39ff88 sirve). Punteado fino. Muestra casi toda la trayectoria (línea larga; el largo se modula con el stat LÍNEA).

## 4. Grilla de contacto sobre el balón (mockup nítido; en video sólo se vislumbra un recuadro verde junto al balón)

- Gráfico del balón con **patrón de pentágonos**, **punto rojo** del contacto + **cruz fina**, y **etiqueta inferior en mayúsculas** con el tipo de golpe ("CHANFLE CON EL INTERIOR DEL PIE", etc.).
- Datos junto al balón: "PUNTO DE IMPACTO x:0.62 y:0.10" y el nombre del golpe.
- En el video, anclada al balón en el mundo, tamaño ~2–3× el balón. (En el mockup se ve además un panel grande a la derecha "SELECCIÓN DE CONTACTO" — es la MISMA info ampliada; mantenemos el selector sobre el balón según CLAUDE.md.)
- ⇒ 1.9c.3 sin cambios de fondo: anclar al centro del balón, ~2.5× radio, punto rojo + cruz + etiqueta mayúsculas.

## 5. Barra de potencia (del mockup; OCLUIDA en el video)

- Abajo-centro: "**POTENCIA DEL DISPARO**", **5 segmentos**, marca de **"POTENCIA IDEAL 2.75–3.25 BARRAS"** y **"POTENCIA PERFECTA ±0.15 SIN BONUS DE POTENCIA"**.
- Velocidad de llenado: **no medible en el video** (ocluida). Mantener ~1.0–1.2 s de 1→5 (POWER_FILL_MS≈1100–1200) → confirmar en vivo.
- ⇒ Ajuste menor 1.9c.4/spec: rango ideal **2.75–3.25** (centro 3.0, semiancho perfecto 0.15) en lugar de 2.5–3.0; centro óptimo del golpe natural/curva ≈ **3.0**.

## 6. Carrera del pateador (NO medible con precisión aquí)

- No se capturó un golpeo limpio (escena de apuntado continua + cortes a celebración). Frames de carrera no contables con fiabilidad.
- Estimación de diseño: **carrera ~0.5–0.8 s** (Diego ~600 ms) → confirmar en vivo. Sin cambio respecto a la spec.

## 7. Cámara durante el vuelo y secuencia del gol (CONFIABLE en lo cualitativo)

- Tras el golpeo, en el **gol** el referente **CORTA a un primer plano cinemático del pateador/jugadores celebrando** (~1.5 s, multitud rugiendo), y luego **vuelve rápido al setup** del siguiente tiro con el panel **"Desafíos: Anota un gol"** arriba. Cortes de escena medidos en 21.3 (→celebración) y 22.9 (→setup): **celebración ≈1.6 s**, ciclo al siguiente tiro **~2 s**.
- ⇒ **Corrección de 1.9c.4(f):** en vez de "repetición de 2 s desde detrás del arco", el gol hace **cut a primer plano de celebración (~1.5 s) + multitud**, saltable, y vuelta inmediata al setup (<2 s total). (La repetición desde detrás del arco queda como opción secundaria.)

## Parámetros concretos derivados (→ a aplicar en 1.9c.1–1.9c.4)

| Parámetro | Valor del video/mockup | Origen |
|---|---|---|
| Seguimiento de cámara | factor ≈0.05, topes ±3° yaw / ±2° pitch (casi fija) | video (escena estática) |
| Distancia/altura de cámara | más cerca y baja: pateador grande en tercio inf-izq | video |
| Retícula | = punto de caída (destino), anillo verde + cruz, en z=0 | video + mockup |
| Línea | verde punteada, del balón, curva, TERMINA en la retícula | video + mockup |
| Modelo de apuntado | al destino con comba incluida (`solveLaunchToTarget`) | confirmado por mockup |
| Contacto | rombo verde + punto rojo + cruz + etiqueta mayúsc., ~2.5× radio | video + mockup |
| Potencia ideal | 2.75–3.25 barras (centro 3.0), perfecta ±0.15 | mockup |
| Gol | cut a primer plano de celebración ~1.5 s + multitud, ciclo <2 s | video |
| Tiempos finos (mira px/f, llenado barra, frames carrera) | NO medibles aquí → estimaciones, confirmar en vivo | — |
