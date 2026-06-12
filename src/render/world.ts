import * as THREE from 'three';
import {
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_DEPTH,
  POST_RADIUS,
  FIELD_DEPTH,
  FIELD_HALF_WIDTH,
} from '@/core/field';
import { buildStadium } from '@/render/stadium';

/**
 * Mundo visual — tarea 1.2.
 * Campo (césped procedural), arco reglamentario con red de líneas,
 * iluminación de estadio nocturno y cielo oscuro.
 */

export interface World {
  group: THREE.Group;
  /** Red del arco (LineSegments) para la ondulación al gol (1.9c.4). */
  net: THREE.LineSegments;
}

/** Textura de césped procedural con franjas de corte (sin assets externos). */
function makeGrassTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context para textura de césped');

  ctx.fillStyle = '#1f7a34';
  ctx.fillRect(0, 0, size, size);

  // Franjas de corte alternadas.
  const stripe = size / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1f7a34' : '#23893b';
    ctx.fillRect(0, i * stripe, size, stripe);
  }

  // Ruido fino para romper el plano liso.
  const img = ctx.getImageData(0, 0, size, size);
  for (let p = 0; p < img.data.length; p += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[p] = Math.max(0, Math.min(255, img.data[p]! + n));
    img.data[p + 1] = Math.max(0, Math.min(255, img.data[p + 1]! + n));
    img.data[p + 2] = Math.max(0, Math.min(255, img.data[p + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(FIELD_HALF_WIDTH, FIELD_DEPTH / 2);
  tex.anisotropy = 4;
  return tex;
}

function buildField(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(FIELD_HALF_WIDTH * 2, FIELD_DEPTH);
  const mat = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 1,
    metalness: 0,
  });
  const field = new THREE.Mesh(geo, mat);
  field.rotation.x = -Math.PI / 2; // plano horizontal
  field.position.z = FIELD_DEPTH / 2 - 5; // un poco detrás del arco también
  field.receiveShadow = true;
  return field;
}

function buildGoal(): { group: THREE.Group; net: THREE.LineSegments } {
  const goal = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0,
    emissive: 0x222222,
  });

  const postGeo = new THREE.CylinderGeometry(
    POST_RADIUS,
    POST_RADIUS,
    GOAL_HEIGHT,
    16,
  );
  const left = new THREE.Mesh(postGeo, white);
  left.position.set(-GOAL_HALF_WIDTH, GOAL_HEIGHT / 2, 0);
  left.castShadow = true;
  const right = left.clone();
  right.position.x = GOAL_HALF_WIDTH;

  const barGeo = new THREE.CylinderGeometry(
    POST_RADIUS,
    POST_RADIUS,
    GOAL_HALF_WIDTH * 2,
    16,
  );
  const bar = new THREE.Mesh(barGeo, white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL_HEIGHT, 0);
  bar.castShadow = true;

  const net = buildNet();
  goal.add(left, right, bar, net);
  return { group: goal, net };
}

/** Líneas reglamentarias del campo (área, área chica, arco y punto penal). */
function buildPitchMarkings(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const y = 0.02;
  const line = (pts: [number, number][]): void => {
    const geo = new THREE.BufferGeometry().setFromPoints(
      pts.map(([x, z]) => new THREE.Vector3(x, y, z)),
    );
    g.add(new THREE.Line(geo, mat));
  };

  // Línea de gol (a lo ancho del campo visible).
  line([[-FIELD_HALF_WIDTH, 0], [FIELD_HALF_WIDTH, 0]]);
  // Área grande (16.5 m × 40.32 m).
  line([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]]);
  // Área chica (5.5 m × 18.32 m).
  line([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]]);
  // Arco del penal (radio 9.15 desde el punto, solo el tramo fuera del área).
  const arc: [number, number][] = [];
  for (let a = 37; a <= 143; a += 4) {
    const r = (a * Math.PI) / 180;
    arc.push([9.15 * Math.cos(r), 11 + 9.15 * Math.sin(r)]);
  }
  line(arc);
  // Punto de penal.
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, y, 11);
  g.add(spot);
  return g;
}

/** Cielo nocturno en gradiente vertical (CanvasTexture como fondo de escena). */
function makeSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0c1b30');
  grad.addColorStop(0.55, '#081320');
  grad.addColorStop(1, '#040a12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Red como grilla de líneas (CLAUDE.md: red con líneas, low-poly). */
function buildNet(): THREE.LineSegments {
  const pts: number[] = [];
  const back = -GOAL_DEPTH;
  const cell = 0.18;

  // Malla del fondo de la red (plano en z = back).
  for (let x = -GOAL_HALF_WIDTH; x <= GOAL_HALF_WIDTH + 1e-3; x += cell) {
    pts.push(x, 0, back, x, GOAL_HEIGHT, back);
  }
  for (let y = 0; y <= GOAL_HEIGHT + 1e-3; y += cell) {
    pts.push(-GOAL_HALF_WIDTH, y, back, GOAL_HALF_WIDTH, y, back);
  }
  // Techo y laterales (líneas que unen frente con fondo).
  for (let x = -GOAL_HALF_WIDTH; x <= GOAL_HALF_WIDTH + 1e-3; x += cell) {
    pts.push(x, GOAL_HEIGHT, 0, x, GOAL_HEIGHT, back);
  }
  for (let y = 0; y <= GOAL_HEIGHT + 1e-3; y += cell) {
    pts.push(-GOAL_HALF_WIDTH, y, 0, -GOAL_HALF_WIDTH, y, back);
    pts.push(GOAL_HALF_WIDTH, y, 0, GOAL_HALF_WIDTH, y, back);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
  });
  const net = new THREE.LineSegments(geo, mat);
  // Copia de las posiciones base para la ondulación (1.9c.4).
  net.userData.basePositions = Float32Array.from(pts);
  return net;
}

function buildLights(scene: THREE.Scene): void {
  // Ambiente nocturno tenue.
  scene.add(new THREE.HemisphereLight(0x335577, 0x0a0e14, 0.45));

  // Torres de iluminación (4 focos altos tipo estadio).
  const towers: [number, number][] = [
    [-25, 20],
    [25, 20],
    [-25, -8],
    [25, -8],
  ];
  for (const [x, z] of towers) {
    const spot = new THREE.SpotLight(0xfff2dd, 180, 120, Math.PI / 5, 0.4, 1.2);
    spot.position.set(x, 26, z);
    spot.target.position.set(0, 0, 6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot, spot.target);
  }
}

export function buildWorld(scene: THREE.Scene): World {
  scene.background = makeSkyTexture(); // cielo nocturno en gradiente
  scene.fog = new THREE.Fog(0x060c16, 55, 120);

  const group = new THREE.Group();
  const field = buildField();
  const goal = buildGoal();
  group.add(field, buildPitchMarkings(), goal.group);
  scene.add(group);
  buildLights(scene);
  buildStadium(scene);

  return { group, net: goal.net };
}
