import * as THREE from 'three';
import { BALL_RADIUS } from '@/core/field';

const PANEL_FORWARD = new THREE.Vector3(0, 0, 1);

const BALL_COLORS = {
  blue: '#087aff',
  red: '#ea2637',
  lime: '#72d744',
  ink: '#101827',
  silver: '#d7d8cf',
  pearl: '#fffdf7',
};

export function createBall(): THREE.Mesh {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 72, 48),
    new THREE.MeshStandardMaterial({
      map: makeModernTournamentBallTexture(),
      color: 0xffffff,
      roughness: 0.66,
      metalness: 0,
      emissive: 0x14110d,
      emissiveIntensity: 0,
    }),
  );
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.position.set(0, BALL_RADIUS, 20);

  addFluidRaisedPanels(shell);
  addDebossedPanelLines(shell);
  return shell;
}

function makeModernTournamentBallTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for ball texture');

  const base = ctx.createRadialGradient(size * 0.35, size * 0.28, 10, size * 0.5, size * 0.5, size * 0.72);
  base.addColorStop(0, '#ffffff');
  base.addColorStop(0.58, BALL_COLORS.pearl);
  base.addColorStop(1, '#e5e0d4');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  drawLeatherGrain(ctx, size);
  drawFourPanelGuides(ctx, size);
  drawRetroPanelStars(ctx, size);
  drawWaveSet(ctx, size);
  drawTriHostKnots(ctx, size);
  drawMicroDebossing(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 12;
  return tex;
}

function drawLeatherGrain(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 3200; i++) {
    const v = 198 + Math.random() * 48;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawRetroPanelStars(ctx: CanvasRenderingContext2D, size: number): void {
  const panels = [
    [0.5, 0.5, 0],
    [0.08, 0.5, 0.18],
    [0.92, 0.5, -0.18],
    [0.28, 0.18, -0.28],
    [0.72, 0.18, 0.26],
    [0.28, 0.82, 0.22],
    [0.72, 0.82, -0.22],
  ] as const;

  for (const [u, v, rot] of panels) {
    ctx.save();
    ctx.translate(u * size, v * size);
    ctx.rotate(rot);
    const r = size * 0.072;
    ctx.fillStyle = 'rgba(14, 18, 27, 0.84)';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
    ctx.restore();
  }
}

function drawFourPanelGuides(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(24, 30, 42, 0.12)';
  ctx.lineWidth = 7;

  for (const y of [0.2, 0.5, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, size * y);
    ctx.bezierCurveTo(size * 0.18, size * (y - 0.075), size * 0.42, size * (y + 0.08), size * 0.66, size * y);
    ctx.bezierCurveTo(size * 0.8, size * (y - 0.055), size * 0.94, size * (y + 0.045), size * 1.05, size * y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
  ctx.lineWidth = 3;
  for (const y of [0.34, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, size * y);
    ctx.bezierCurveTo(size * 0.32, size * (y + 0.065), size * 0.68, size * (y - 0.065), size * 1.05, size * y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWaveSet(ctx: CanvasRenderingContext2D, size: number): void {
  const waves = [
    { u: 0.1, v: 0.18, rot: -0.28, color: BALL_COLORS.blue },
    { u: 0.36, v: 0.28, rot: 0.34, color: BALL_COLORS.red },
    { u: 0.63, v: 0.18, rot: -0.4, color: BALL_COLORS.lime },
    { u: 0.88, v: 0.32, rot: 0.22, color: BALL_COLORS.blue },
    { u: 0.15, v: 0.55, rot: 0.28, color: BALL_COLORS.red },
    { u: 0.43, v: 0.49, rot: -0.22, color: BALL_COLORS.lime },
    { u: 0.7, v: 0.58, rot: 0.36, color: BALL_COLORS.blue },
    { u: 0.95, v: 0.52, rot: -0.2, color: BALL_COLORS.red },
    { u: 0.25, v: 0.82, rot: -0.3, color: BALL_COLORS.blue },
    { u: 0.54, v: 0.75, rot: 0.24, color: BALL_COLORS.red },
    { u: 0.82, v: 0.82, rot: -0.36, color: BALL_COLORS.lime },
  ];

  ctx.save();
  ctx.globalAlpha = 0.76;
  for (const wave of waves) {
    drawTournamentWave(ctx, wave.u * size, wave.v * size, size * 0.16, wave.rot, wave.color);
    if (wave.u < 0.14) drawTournamentWave(ctx, (wave.u + 1) * size, wave.v * size, size * 0.16, wave.rot, wave.color);
    if (wave.u > 0.86) drawTournamentWave(ctx, (wave.u - 1) * size, wave.v * size, size * 0.16, wave.rot, wave.color);
  }
  ctx.restore();
}

function drawTournamentWave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rotation: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-r * 1.02, -r * 0.1);
  ctx.bezierCurveTo(-r * 0.68, -r * 0.95, r * 0.18, -r * 0.98, r * 0.55, -r * 0.28);
  ctx.bezierCurveTo(r * 0.96, r * 0.5, r * 0.28, r * 1.02, -r * 0.2, r * 0.58);
  ctx.bezierCurveTo(-r * 0.58, r * 0.24, -r * 0.66, -r * 0.16, -r * 1.02, -r * 0.1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.lineWidth = r * 0.11;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(16, 24, 39, 0.22)';
  ctx.lineWidth = r * 0.035;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-r * 0.78, -r * 0.05);
  ctx.bezierCurveTo(-r * 0.24, -r * 0.33, r * 0.18, -r * 0.22, r * 0.62, r * 0.18);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = r * 0.05;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-r * 0.28, r * 0.48);
  ctx.lineTo(r * 0.42, -r * 0.42);
  ctx.strokeStyle = 'rgba(16, 24, 39, 0.18)';
  ctx.lineWidth = r * 0.04;
  ctx.stroke();

  ctx.restore();
}

function drawTriHostKnots(ctx: CanvasRenderingContext2D, size: number): void {
  const knots = [
    [0.5, 0.5],
    [0.02, 0.5],
    [0.98, 0.5],
  ] as const;

  for (const [u, v] of knots) {
    ctx.save();
    ctx.translate(u * size, v * size);
    ctx.rotate(-0.08);
    const r = size * 0.062;
    drawSmallTriangle(ctx, 0, -r * 0.18, r, BALL_COLORS.blue, -Math.PI / 2);
    drawSmallTriangle(ctx, -r * 0.36, r * 0.22, r, BALL_COLORS.red, Math.PI * 0.78);
    drawSmallTriangle(ctx, r * 0.36, r * 0.22, r, BALL_COLORS.lime, Math.PI * 0.22);
    ctx.restore();
  }
}

function drawSmallTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  rot: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(r * 0.5, 0);
  ctx.lineTo(-r * 0.32, -r * 0.34);
  ctx.lineTo(-r * 0.22, r * 0.38);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.stroke();
  ctx.restore();
}

function drawMicroDebossing(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = BALL_COLORS.silver;
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = ((i * 0.173) % 1) * size;
    const y = (0.12 + ((i * 0.291) % 0.76)) * size;
    const r = size * (0.018 + (i % 3) * 0.006);
    ctx.beginPath();
    ctx.arc(x, y, r, 0.2, Math.PI * 1.72);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function addDebossedPanelLines(ball: THREE.Mesh): void {
  const seamMat = new THREE.LineBasicMaterial({
    color: 0x1d2432,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const shineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  for (const t of [-0.62, -0.22, 0.22, 0.62]) {
    ball.add(makeLatitude(t, seamMat));
  }
  for (const rot of [0, Math.PI / 2]) {
    ball.add(makeMeridian(rot, seamMat));
  }
  ball.add(makeLatitude(0, shineMat));
}

function addFluidRaisedPanels(ball: THREE.Mesh): void {
  const decalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const trimMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const patches = [
    { normal: new THREE.Vector3(0.1, 0.16, 0.98), color: 0x087aff, scale: 1.0, rot: 0.2 },
    { normal: new THREE.Vector3(-0.48, 0.38, 0.78), color: 0xea2637, scale: 0.92, rot: -0.26 },
    { normal: new THREE.Vector3(0.55, -0.34, 0.76), color: 0x72d744, scale: 0.96, rot: 0.4 },
    { normal: new THREE.Vector3(-0.78, -0.08, 0.62), color: 0x087aff, scale: 0.82, rot: -0.14 },
    { normal: new THREE.Vector3(0.82, 0.22, 0.52), color: 0xea2637, scale: 0.84, rot: 0.28 },
    { normal: new THREE.Vector3(-0.08, 0.84, 0.52), color: 0x72d744, scale: 0.76, rot: -0.36 },
    { normal: new THREE.Vector3(0.1, -0.86, 0.5), color: 0x087aff, scale: 0.78, rot: 0.12 },
  ];

  for (const patch of patches) {
    const geo = makeWaveDecalGeometry(BALL_RADIUS * 0.24 * patch.scale, patch.rot);
    const mat = decalMat.clone();
    mat.color.setHex(patch.color);
    const normal = patch.normal.normalize();
    const panel = new THREE.Mesh(geo, mat);
    panel.position.copy(normal).multiplyScalar(BALL_RADIUS * 1.007);
    panel.quaternion.setFromUnitVectors(PANEL_FORWARD, normal);
    panel.castShadow = true;

    const trim = new THREE.LineSegments(new THREE.EdgesGeometry(geo), trimMat);
    panel.add(trim);
    ball.add(panel);
  }
}

function makeWaveDecalGeometry(radius: number, rotation: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-radius * 0.95, -radius * 0.08);
  shape.bezierCurveTo(-radius * 0.58, -radius * 0.8, radius * 0.16, -radius * 0.85, radius * 0.52, -radius * 0.25);
  shape.bezierCurveTo(radius * 0.9, radius * 0.38, radius * 0.28, radius * 0.88, -radius * 0.16, radius * 0.5);
  shape.bezierCurveTo(-radius * 0.5, radius * 0.2, -radius * 0.62, -radius * 0.16, -radius * 0.95, -radius * 0.08);
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.rotateZ(rotation);
  return geo;
}

function makeLatitude(t: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const y = BALL_RADIUS * t;
  const r = Math.sqrt(Math.max(0, BALL_RADIUS * BALL_RADIUS - y * y)) * 1.006;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), mat);
}

function makeMeridian(rotation: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.sin(a) * BALL_RADIUS * 1.006,
        Math.cos(a) * BALL_RADIUS * 1.006,
        0,
      ).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
    );
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), mat);
}
