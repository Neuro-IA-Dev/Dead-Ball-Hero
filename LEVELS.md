# LEVELS.md — DEAD BALL HERO · Especificación del formato de niveles

> Claude Code: este archivo es la fuente de verdad de la tarea 1.13. El esquema es contrato: implementa el tipo TypeScript tal cual y un loader con validación. Los 5 niveles del MVP están al final, listos para copiar a `src/data/levels/`.

## Esquema (TypeScript)

```ts
/** Coordenadas: origen en el centro de la línea de gol, eje X hacia la derecha
 *  del arquero (mirando al campo), eje Z hacia el campo, eje Y hacia arriba.
 *  Unidades: metros. El arco va de x=-3.66 a x=3.66, altura 2.44. */

export type KickType = 'curva' | 'caida' | 'knuckle' | 'trivela' | 'raso' | 'bajo_barrera' | 'globo';

export interface LevelSpec {
  id: string;                  // "a1-n01" (acto 1, nivel 01)
  act: 1 | 2 | 3 | 4;
  order: number;               // orden dentro del acto
  nameKey: string;             // clave i18n, ej. "levels.a1n01.name"
  briefKey: string;            // clave i18n del texto narrativo previo

  // Posición del tiro
  ball: { x: number; z: number };       // z = distancia a la línea de gol
  attempts: number;                      // intentos disponibles
  goalsNeeded: number;                   // goles para superar el nivel

  // Contexto narrativo (HUD)
  scenario?: {
    minute: number;            // ej. 92
    scoreHome: number;
    scoreAway: number;
    playerIsHome: boolean;
    weather: 'clear' | 'rain' | 'night';
    crowdIntensity: 0 | 1 | 2 | 3;       // 0 = entrenamiento vacío
  };

  // Obstáculos
  wall: null | {
    players: number;           // 0–6 cápsulas
    distance: number;          // metros desde el balón (reglamentario: 9.15)
    jumpChance: number;        // 0–1, prob. de saltar al disparo (MVP: 0)
  };
  keeper: null | {
    reactionMs: number;        // delay antes de moverse (MVP Diego-friendly: 280–340)
    diveSpeed: number;         // m/s lateral (MVP: 6.5–7.5)
    offLine?: number;          // metros adelantado (para 'globo'; MVP: 0)
  };

  wind?: { x: number; z: number };       // m/s, solo Acto 4 / arcade

  // Ayudas y restricciones
  aidLineOverride?: number;    // 0–1 fuerza el largo de línea (si falta, manda el stat LÍNEA del pateador)
  requiredKick?: KickType;     // si existe, solo ese tiro puntúa
  forcedKicker?: string;       // id de pateador obligatorio (capítulos de mentor)

  // Estrellas: la 1ª siempre es superar el nivel; estas definen la 2ª y 3ª
  stars: {
    two: StarCondition;
    three: StarCondition;
  };

  rewardCoins: number;
  legendaryMoment?: boolean;   // activa escenografía especial del mentor
}

export type StarCondition =
  | { type: 'perfect_power' }                      // gol soltando en "potencia perfecta" (±0.15 barras del centro óptimo del tiro)
  | { type: 'target'; corner: 'TL'|'TR'|'BL'|'BR'; radius: number }  // diana (m)
  | { type: 'no_aid_line' }                        // sin línea de ayuda
  | { type: 'kick'; kick: KickType }               // gol con tiro específico
  | { type: 'all_attempts' };                      // convertir todos los intentos
```

## Reglas del loader
- Validar contra el esquema al cargar; nivel inválido = error en consola con el campo culpable, nunca fallo silencioso.
- `nameKey`/`briefKey` deben existir en `es.json`; si falta la clave, mostrar la clave cruda (visible en QA).
- El progreso guardado en localStorage referencia niveles por `id`; nunca por índice.

## Los 5 niveles del MVP (Acto 1 — "La Academia", mentor Diego)

```json
[
  {
    "id": "a1-n01", "act": 1, "order": 1,
    "nameKey": "levels.a1n01.name", "briefKey": "levels.a1n01.brief",
    "ball": { "x": 0, "z": 18 },
    "attempts": 5, "goalsNeeded": 1,
    "scenario": { "minute": 0, "scoreHome": 0, "scoreAway": 0, "playerIsHome": true, "weather": "clear", "crowdIntensity": 0 },
    "wall": null, "keeper": null,
    "aidLineOverride": 1.0,
    "stars": { "two": { "type": "perfect_power" }, "three": { "type": "all_attempts" } },
    "rewardCoins": 50
  },
  {
    "id": "a1-n02", "act": 1, "order": 2,
    "nameKey": "levels.a1n02.name", "briefKey": "levels.a1n02.brief",
    "ball": { "x": 0, "z": 20 },
    "attempts": 5, "goalsNeeded": 2,
    "scenario": { "minute": 0, "scoreHome": 0, "scoreAway": 0, "playerIsHome": true, "weather": "clear", "crowdIntensity": 0 },
    "wall": null,
    "keeper": { "reactionMs": 340, "diveSpeed": 6.5 },
    "aidLineOverride": 1.0,
    "stars": { "two": { "type": "target", "corner": "TR", "radius": 1.0 }, "three": { "type": "target", "corner": "TL", "radius": 1.0 } },
    "rewardCoins": 60
  },
  {
    "id": "a1-n03", "act": 1, "order": 3,
    "nameKey": "levels.a1n03.name", "briefKey": "levels.a1n03.brief",
    "ball": { "x": 0, "z": 20 },
    "attempts": 4, "goalsNeeded": 2,
    "scenario": { "minute": 0, "scoreHome": 0, "scoreAway": 0, "playerIsHome": true, "weather": "clear", "crowdIntensity": 1 },
    "wall": null,
    "keeper": { "reactionMs": 320, "diveSpeed": 7.0 },
    "aidLineOverride": 0.8,
    "stars": { "two": { "type": "perfect_power" }, "three": { "type": "all_attempts" } },
    "rewardCoins": 70
  },
  {
    "id": "a1-n04", "act": 1, "order": 4,
    "nameKey": "levels.a1n04.name", "briefKey": "levels.a1n04.brief",
    "ball": { "x": -4, "z": 20 },
    "attempts": 4, "goalsNeeded": 1,
    "scenario": { "minute": 0, "scoreHome": 0, "scoreAway": 0, "playerIsHome": true, "weather": "clear", "crowdIntensity": 1 },
    "wall": { "players": 4, "distance": 9.15, "jumpChance": 0 },
    "keeper": { "reactionMs": 320, "diveSpeed": 7.0 },
    "aidLineOverride": 0.8,
    "stars": { "two": { "type": "perfect_power" }, "three": { "type": "kick", "kick": "curva" } },
    "rewardCoins": 80
  },
  {
    "id": "a1-n05", "act": 1, "order": 5,
    "nameKey": "levels.a1n05.name", "briefKey": "levels.a1n05.brief",
    "ball": { "x": 0, "z": 22 },
    "attempts": 5, "goalsNeeded": 3,
    "scenario": { "minute": 88, "scoreHome": 1, "scoreAway": 1, "playerIsHome": true, "weather": "night", "crowdIntensity": 2 },
    "wall": { "players": 5, "distance": 9.15, "jumpChance": 0 },
    "keeper": { "reactionMs": 300, "diveSpeed": 7.2 },
    "forcedKicker": "diego",
    "aidLineOverride": 0.7,
    "stars": { "two": { "type": "perfect_power" }, "three": { "type": "target", "corner": "TR", "radius": 1.2 } },
    "rewardCoins": 150
  }
]
```

## Textos `es.json` de estos niveles (copiar al locale)

```json
{
  "levels": {
    "a1n01": { "name": "Primer contacto", "brief": "Cancha vacía. Solo tú, la pelota y el arco. Aprende la barra de potencia: ni suave que no llegue, ni fuerte que se vaya a las nubes." },
    "a1n02": { "name": "Las esquinas", "brief": "Llegó el arquero. Donde él no llega es donde tú apuntas: las esquinas son tu nuevo hogar." },
    "a1n03": { "name": "La potencia justa", "brief": "Diego te mira de brazos cruzados: 'Cualquiera le pega fuerte. Los grandes saben CUANTO'. Suelta la barra en el punto exacto y mira como brilla." },
    "a1n04": { "name": "La barrera", "brief": "Cuatro gigantes entre tú y el gol. Apunta al costado del palo, dale tres barras y deja que la curva haga el resto." },
    "a1n05": { "name": "El examen de Diego", "brief": "Minuto 88, clásico de barrio empatado. Diego te entrega la pelota: 'Mostrame que aprendiste, pibe'. Tres goles y el Acto 2 es tuyo." }
  }
}
```