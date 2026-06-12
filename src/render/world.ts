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

export type TimeOfDay = 'clear' | 'rain' | 'night';

export interface World {
  group: THREE.Group;
  /** Red del arco (LineSegments) para la ondulacion al gol. */
  net: THREE.LineSegments;
  /** Cambia el ambiente (cielo, luces, niebla) según el clima del nivel. */
  setTimeOfDay: (when: TimeOfDay) => void;
}

function makeGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for grass texture');

  ctx.fillStyle = '#287f3a';
  ctx.fillRect(0, 0, size, size);

  const stripe = size / 10;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#237936' : '#2f8d43';
    ctx.fillRect(0, i * stripe, size, stripe);
  }

  const img = ctx.getImageData(0, 0, size, size);
  for (let p = 0; p < img.data.length; p += 4) {
    const n = (Math.random() - 0.5) * 20;
    img.data[p] = Math.max(0, Math.min(255, img.data[p]! + n));
    img.data[p + 1] = Math.max(0, Math.min(255, img.data[p + 1]! + n));
    img.data[p + 2] = Math.max(0, Math.min(255, img.data[p + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 4 + Math.random() * 7;
    ctx.strokeStyle = Math.random() > 0.5 ? '#7fc36d' : '#145f2b';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 1.8, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildField(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(FIELD_HALF_WIDTH * 2, FIELD_DEPTH);
  const mat = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 0.96,
    metalness: 0,
  });
  const field = new THREE.Mesh(geo, mat);
  field.rotation.x = -Math.PI / 2;
  field.position.z = FIELD_DEPTH / 2 - 5;
  field.receiveShadow = true;
  return field;
}

function buildGoal(): { group: THREE.Group; net: THREE.LineSegments } {
  const goal = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.05,
    emissive: 0x171717,
  });

  const left = makePostBetween(
    new THREE.Vector3(-GOAL_HALF_WIDTH, 0, 0),
    new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT, 0),
    white,
  );
  const right = makePostBetween(
    new THREE.Vector3(GOAL_HALF_WIDTH, 0, 0),
    new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT, 0),
    white,
  );
  const bar = makePostBetween(
    new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT, 0),
    new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT, 0),
    white,
  );
  const rearLeft = makePostBetween(
    new THREE.Vector3(-GOAL_HALF_WIDTH, 0, -GOAL_DEPTH),
    new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.92, -GOAL_DEPTH),
    white,
    POST_RADIUS * 0.7,
  );
  const rearRight = makePostBetween(
    new THREE.Vector3(GOAL_HALF_WIDTH, 0, -GOAL_DEPTH),
    new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.92, -GOAL_DEPTH),
    white,
    POST_RADIUS * 0.7,
  );
  const rearBar = makePostBetween(
    new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.92, -GOAL_DEPTH),
    new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.92, -GOAL_DEPTH),
    white,
    POST_RADIUS * 0.7,
  );
  const leftRoof = makePostBetween(
    new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT, 0),
    new THREE.Vector3(-GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.92, -GOAL_DEPTH),
    white,
    POST_RADIUS * 0.55,
  );
  const rightRoof = makePostBetween(
    new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT, 0),
    new THREE.Vector3(GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.92, -GOAL_DEPTH),
    white,
    POST_RADIUS * 0.55,
  );

  const net = buildNet();
  goal.add(left, right, bar, rearLeft, rearRight, rearBar, leftRoof, rightRoof, net);
  return { group: goal, net };
}

function makePostBetween(
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  radius = POST_RADIUS,
): THREE.Mesh {
  const delta = new THREE.Vector3().subVectors(to, from);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 20), material);
  post.position.copy(from).addScaledVector(delta, 0.5);
  post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  post.castShadow = true;
  post.receiveShadow = true;
  return post;
}

function buildPitchMarkings(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78 });
  const y = 0.022;
  const line = (pts: [number, number][]): void => {
    const geo = new THREE.BufferGeometry().setFromPoints(
      pts.map(([x, z]) => new THREE.Vector3(x, y, z)),
    );
    g.add(new THREE.Line(geo, mat));
  };

  line([[-FIELD_HALF_WIDTH, 0], [FIELD_HALF_WIDTH, 0]]);
  line([[-FIELD_HALF_WIDTH, 0], [-FIELD_HALF_WIDTH, FIELD_DEPTH - 8]]);
  line([[FIELD_HALF_WIDTH, 0], [FIELD_HALF_WIDTH, FIELD_DEPTH - 8]]);
  line([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]]);
  line([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]]);

  const arc: [number, number][] = [];
  for (let a = 37; a <= 143; a += 4) {
    const r = (a * Math.PI) / 180;
    arc.push([9.15 * Math.cos(r), 11 + 9.15 * Math.sin(r)]);
  }
  line(arc);

  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, y, 11);
  g.add(spot);
  return g;
}

function makeSkyTexture(stops: [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const NIGHT_SKY: [number, string][] = [
  [0, '#132844'],
  [0.45, '#081625'],
  [0.72, '#040b13'],
  [1, '#02050a'],
];
const DAY_SKY: [number, string][] = [
  [0, '#3f7fc4'],
  [0.5, '#6fa8d8'],
  [0.8, '#a9cbe6'],
  [1, '#cfe2ef'],
];
const RAIN_SKY: [number, string][] = [
  [0, '#3a4450'],
  [0.5, '#4a555f'],
  [0.85, '#5a636b'],
  [1, '#6b727a'],
];

function buildNet(): THREE.LineSegments {
  const pts: number[] = [];
  const back = -GOAL_DEPTH;
  const cell = 0.18;

  for (let x = -GOAL_HALF_WIDTH; x <= GOAL_HALF_WIDTH + 1e-3; x += cell) {
    pts.push(x, 0, back, x, GOAL_HEIGHT, back);
  }
  for (let y = 0; y <= GOAL_HEIGHT + 1e-3; y += cell) {
    pts.push(-GOAL_HALF_WIDTH, y, back, GOAL_HALF_WIDTH, y, back);
  }
  for (let x = -GOAL_HALF_WIDTH; x <= GOAL_HALF_WIDTH + 1e-3; x += cell) {
    pts.push(x, GOAL_HEIGHT, 0, x, GOAL_HEIGHT * 0.92, back);
  }
  for (let y = 0; y <= GOAL_HEIGHT + 1e-3; y += cell) {
    const rearY = Math.min(y, GOAL_HEIGHT * 0.92);
    pts.push(-GOAL_HALF_WIDTH, y, 0, -GOAL_HALF_WIDTH, rearY, back);
    pts.push(GOAL_HALF_WIDTH, y, 0, GOAL_HALF_WIDTH, rearY, back);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.48,
  });
  const net = new THREE.LineSegments(geo, mat);
  net.userData.basePositions = Float32Array.from(pts);
  return net;
}

interface WorldLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  spots: THREE.SpotLight[];
  /** Foco principal sobre el pateador (lo modela como sujeto/héroe). */
  key: THREE.SpotLight;
  /** Luz de recorte: edge-light que despega al jugador del fondo oscuro. */
  rim: THREE.DirectionalLight;
}

/** Zona del pateador (Acto 1, z≈18–25): foco hacia aquí. */
const KICKER_FOCUS = new THREE.Vector3(0, 1.15, 21);

function buildLights(scene: THREE.Scene): WorldLights {
  const hemi = new THREE.HemisphereLight(0x6f91ba, 0x0a0e14, 0.34);
  scene.add(hemi);

  // Luz direccional única (luna de noche / sol de día), reusada por el ambiente.
  const sun = new THREE.DirectionalLight(0x9fbfff, 0.52);
  sun.position.set(-16, 22, 28);
  scene.add(sun);

  const towers: [number, number][] = [
    [-25, 20],
    [25, 20],
    [-25, -8],
    [25, -8],
  ];
  const spots: THREE.SpotLight[] = [];
  for (const [x, z] of towers) {
    const spot = new THREE.SpotLight(0xfff2dd, 120, 120, Math.PI / 5, 0.42, 1.25);
    spot.position.set(x, 26, z);
    spot.target.position.set(0, 0, 6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot, spot.target);
    spots.push(spot);
  }

  // Foco "héroe" sobre el pateador (cálido, desde arriba-frente del lado de cámara).
  const key = new THREE.SpotLight(0xfff0d8, 46, 70, Math.PI / 6, 0.58, 1.35);
  key.position.set(-3.5, 10, 28);
  key.target.position.copy(KICKER_FOCUS);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  // Rim/back-light frío desde el lado del arco: recorta la silueta sobre la multitud.
  const rim = new THREE.DirectionalLight(0xa9d2ff, 0.72);
  rim.position.set(6, 11, -3);
  rim.target.position.copy(KICKER_FOCUS);
  scene.add(rim, rim.target);

  return { hemi, sun, spots, key, rim };
}

export function buildWorld(scene: THREE.Scene): World {
  scene.fog = new THREE.Fog(0x07101c, 42, 118);

  const group = new THREE.Group();
  const field = buildField();
  const goal = buildGoal();
  group.add(field, buildPitchMarkings(), goal.group);
  scene.add(group);
  const lights = buildLights(scene);
  buildStadium(scene);

  const skies: Record<TimeOfDay, THREE.CanvasTexture> = {
    night: makeSkyTexture(NIGHT_SKY),
    clear: makeSkyTexture(DAY_SKY),
    rain: makeSkyTexture(RAIN_SKY),
  };

  const setTimeOfDay = (when: TimeOfDay): void => {
    scene.background = skies[when];
    const fog = scene.fog as THREE.Fog;
    switch (when) {
      case 'clear':
        fog.color.set(0xa9cbe6);
        fog.near = 70;
        fog.far = 180;
        lights.hemi.color.set(0xbfe0ff);
        lights.hemi.intensity = 0.72;
        lights.sun.color.set(0xfff4e0);
        lights.sun.intensity = 1.05;
        for (const s of lights.spots) s.intensity = 16;
        lights.key.intensity = 18;
        lights.rim.intensity = 0.34;
        break;
      case 'rain':
        fog.color.set(0x59626b);
        fog.near = 45;
        fog.far = 120;
        lights.hemi.color.set(0x9aa6b2);
        lights.hemi.intensity = 0.46;
        lights.sun.color.set(0xc6d2de);
        lights.sun.intensity = 0.36;
        for (const s of lights.spots) s.intensity = 78;
        lights.key.intensity = 34;
        lights.rim.intensity = 0.48;
        break;
      case 'night':
      default:
        fog.color.set(0x07101c);
        fog.near = 42;
        fog.far = 118;
        lights.hemi.color.set(0x6f91ba);
        lights.hemi.intensity = 0.34;
        lights.sun.color.set(0x9fbfff);
        lights.sun.intensity = 0.52;
        for (const s of lights.spots) s.intensity = 120;
        lights.key.intensity = 46;
        lights.rim.intensity = 0.72;
        break;
    }
  };

  setTimeOfDay('night');

  return { group, net: goal.net, setTimeOfDay };
}
