import * as THREE from 'three';
import {
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_DEPTH,
  POST_RADIUS,
  FIELD_DEPTH,
  FIELD_HALF_WIDTH,
} from '@/core/field';

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

/** Red como grilla de líneas (CLAUDE.md: red con líneas, low-poly). */
function buildNet(): THREE.LineSegments {
  const pts: number[] = [];
  const back = -GOAL_DEPTH;
  const cell = 0.3;

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
  scene.background = new THREE.Color(0x06080d); // cielo oscuro
  scene.fog = new THREE.Fog(0x06080d, 45, 90);

  const group = new THREE.Group();
  const field = buildField();
  const goal = buildGoal();
  group.add(field, goal.group);
  scene.add(group);
  buildLights(scene);

  return { group, net: goal.net };
}
