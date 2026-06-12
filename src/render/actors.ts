import * as THREE from 'three';
import type { ShotPhase } from '@/game/shot-machine';
import type { Kicker, KickStyle } from '@/game/kicker';
import { BALL_RADIUS, GOAL_HEIGHT } from '@/core/field';

const UP = new THREE.Vector3(0, 1, 0);

/** Parámetros de la "forma de pegarle" por estilo (firma visual). */
interface StyleParams {
  approach: number; // distancia de la pose de espera (largo de carrera)
  sideStand: number; // offset lateral de la espera (diagonal vs recta)
  plantBack: number; // distancia de plantado al balón
  strides: number; // zancadas en la carrera
  windupPeak: number; // cargada de la pierna atrás
  swingPeak: number; // follow-through (más negativo = barrido más amplio)
  footTurn: number; // giro del pie al contacto (interior vs empeine)
}

const KICK_STYLES: Record<KickStyle, StyleParams> = {
  // Colocada con el interior: carrera corta y diagonal, pie abierto, suave.
  finesse: { approach: 2.5, sideStand: 1.28, plantBack: 0.46, strides: 2, windupPeak: 0.85, swingPeak: -1.18, footTurn: 0.4 },
  // Potencia con el empeine: carrera larga y recta, barrido grande, pie recto.
  power: { approach: 3.7, sideStand: 0.78, plantBack: 0.56, strides: 4, windupPeak: 1.18, swingPeak: -1.62, footTurn: 0.05 },
  // Knuckle: postura cuadrada, frontal, golpe seco con poca rotación.
  knuckle: { approach: 3.0, sideStand: 0.52, plantBack: 0.5, strides: 3, windupPeak: 1.0, swingPeak: -1.48, footTurn: 0.0 },
  // Natural: los valores que ya tenía la animación.
  natural: { approach: 2.8, sideStand: 1.05, plantBack: 0.5, strides: 3, windupPeak: 1.05, swingPeak: -1.42, footTurn: 0.06 },
};

function easeInQuad(t: number): number {
  return t * t;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function shadow(mesh: THREE.Object3D): THREE.Object3D {
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return mesh;
}

function makeKitTextTexture(
  text: string,
  width: number,
  height: number,
  fontPx: number,
  color = '#12151b',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for kit text');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = `900 ${fontPx}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(10, 14, 20, 0.18)';
  ctx.shadowBlur = 1;
  ctx.lineWidth = Math.max(3, fontPx * 0.06);
  ctx.strokeStyle = 'rgba(245, 250, 255, 0.34)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeKitNumber(text: string): THREE.Mesh {
  const number = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.35),
    new THREE.MeshBasicMaterial({
      map: makeKitNumberTexture(text),
      alphaTest: 0.08,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      toneMapped: true,
    }),
  );
  number.renderOrder = 12;
  return number;
}

function makeKitNumberTexture(text: string, color = '#12151b'): THREE.CanvasTexture {
  return makeKitTextTexture(text, 128, 160, 98, color);
}

function makeKitName(text: string): THREE.Mesh {
  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.095),
    new THREE.MeshBasicMaterial({
      map: makeKitTextTexture(text, 256, 64, 38),
      alphaTest: 0.08,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      toneMapped: true,
    }),
  );
  name.renderOrder = 12;
  return name;
}

function setTextMesh(mesh: THREE.Mesh, texture: THREE.CanvasTexture): void {
  if (mesh.material instanceof THREE.MeshBasicMaterial) {
    mesh.material.map?.dispose();
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  }
}

function makeTexturePanel(width: number, height: number): THREE.Mesh {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      alphaTest: 0.12,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      toneMapped: true,
    }),
  );
  panel.renderOrder = 11;
  return panel;
}

function setPanelTexture(mesh: THREE.Mesh, texture: THREE.CanvasTexture): void {
  if (mesh.material instanceof THREE.MeshBasicMaterial) {
    mesh.material.map?.dispose();
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  }
}

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function mixHex(a: number, b: number, t: number): string {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function readableInk(bg: number): string {
  const r = (bg >> 16) & 255;
  const g = (bg >> 8) & 255;
  const b = bg & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#151a22' : '#dce4ec';
}

type KitPattern =
  | 'plain'
  | 'centerStripe'
  | 'vertical'
  | 'argentina'
  | 'whiteClassic'
  | 'redBlack'
  | 'sash'
  | 'halves'
  | 'hoops'
  | 'yoke';
type FaceMood = 'classic' | 'stern' | 'smile' | 'calm' | 'bearded';
type BodyPresetName =
  | 'compact'
  | 'diego'
  | 'david'
  | 'leo'
  | 'cris'
  | 'balanced'
  | 'artist'
  | 'engine'
  | 'powerhouse'
  | 'tower'
  | 'stocky';

interface BodyPreset {
  torsoX: number;
  torsoY: number;
  torsoZ: number;
  shoulderX: number;
  hipX: number;
  legBulk: number;
  armBulk: number;
  head: number;
  stance: number;
}

const BODY_PRESETS: Record<BodyPresetName, BodyPreset> = {
  compact: { torsoX: 0.92, torsoY: 0.96, torsoZ: 0.95, shoulderX: 0.94, hipX: 0.96, legBulk: 0.96, armBulk: 0.94, head: 1.04, stance: 0.92 },
  diego: { torsoX: 0.95, torsoY: 0.92, torsoZ: 1.02, shoulderX: 1.02, hipX: 1.04, legBulk: 1.22, armBulk: 1.08, head: 1.06, stance: 1.08 },
  david: { torsoX: 0.98, torsoY: 1.04, torsoZ: 0.98, shoulderX: 1.02, hipX: 1.02, legBulk: 1.08, armBulk: 1.02, head: 0.98, stance: 1.02 },
  leo: { torsoX: 0.98, torsoY: 0.94, torsoZ: 1.02, shoulderX: 1.02, hipX: 1.08, legBulk: 1.16, armBulk: 1.08, head: 0.99, stance: 1.08 },
  cris: { torsoX: 1.05, torsoY: 1.1, torsoZ: 1.02, shoulderX: 1.14, hipX: 1.08, legBulk: 1.18, armBulk: 1.12, head: 0.96, stance: 1.12 },
  balanced: { torsoX: 1, torsoY: 1, torsoZ: 1, shoulderX: 1, hipX: 1, legBulk: 1, armBulk: 1, head: 1, stance: 1 },
  artist: { torsoX: 0.98, torsoY: 1.0, torsoZ: 0.94, shoulderX: 0.98, hipX: 0.95, legBulk: 0.92, armBulk: 0.92, head: 1.05, stance: 0.98 },
  engine: { torsoX: 1.02, torsoY: 1.02, torsoZ: 1.0, shoulderX: 1.03, hipX: 1.03, legBulk: 1.06, armBulk: 1.02, head: 1, stance: 1.08 },
  powerhouse: { torsoX: 1.08, torsoY: 1.04, torsoZ: 1.05, shoulderX: 1.12, hipX: 1.14, legBulk: 1.18, armBulk: 1.08, head: 0.98, stance: 1.18 },
  tower: { torsoX: 1.04, torsoY: 1.12, torsoZ: 1.0, shoulderX: 1.08, hipX: 1.04, legBulk: 1.08, armBulk: 1.04, head: 0.96, stance: 1.1 },
  stocky: { torsoX: 1.1, torsoY: 0.98, torsoZ: 1.07, shoulderX: 1.06, hipX: 1.2, legBulk: 1.28, armBulk: 1.06, head: 0.98, stance: 1.24 },
};

function makeCharacterMaterial(color: number, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    flatShading: true,
  });
}

function drawKitShape(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.1);
  ctx.lineTo(w * 0.26, h * 0.02);
  ctx.lineTo(w * 0.74, h * 0.02);
  ctx.lineTo(w * 0.92, h * 0.1);
  ctx.lineTo(w * 0.82, h * 0.96);
  ctx.lineTo(w * 0.18, h * 0.96);
  ctx.closePath();
}

function makeRetroKitTexture(profile: KickerVisualProfile, view: 'front' | 'back'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for retro kit');

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  drawKitShape(ctx, w, h);
  ctx.clip();

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, mixHex(profile.kit, 0xffffff, 0.08));
  base.addColorStop(0.58, hexCss(profile.kit));
  base.addColorStop(1, mixHex(profile.kit, 0x000000, 0.26));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = hexCss(profile.accent);
  switch (profile.pattern) {
    case 'centerStripe':
      ctx.fillRect(w * 0.43, 0, w * 0.14, h);
      ctx.fillStyle = 'rgba(255,255,255,0.26)';
      ctx.fillRect(w * 0.39, 0, w * 0.025, h);
      ctx.fillRect(w * 0.585, 0, w * 0.025, h);
      break;
    case 'vertical':
      for (let x = -w * 0.12; x < w; x += w * 0.22) ctx.fillRect(x, 0, w * 0.12, h);
      break;
    case 'argentina':
      ctx.fillStyle = hexCss(profile.accent);
      for (const x of [w * 0.07, w * 0.37, w * 0.68]) {
        ctx.fillRect(x, 0, w * 0.18, h);
        ctx.fillStyle = 'rgba(34, 83, 119, 0.14)';
        ctx.fillRect(x + w * 0.18, 0, w * 0.018, h);
        ctx.fillStyle = hexCss(profile.accent);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(w * 0.27, 0, w * 0.085, h);
      ctx.fillRect(w * 0.58, 0, w * 0.085, h);
      ctx.fillStyle = 'rgba(15, 25, 36, 0.18)';
      ctx.fillRect(w * 0.1, h * 0.74, w * 0.8, h * 0.035);
      break;
    case 'whiteClassic':
      ctx.fillStyle = hexCss(profile.trim ?? profile.accent);
      ctx.fillRect(w * 0.12, h * 0.08, w * 0.18, h * 0.035);
      ctx.fillRect(w * 0.7, h * 0.08, w * 0.18, h * 0.035);
      ctx.save();
      ctx.translate(w * 0.5, h * 0.07);
      ctx.strokeStyle = hexCss(profile.trim ?? profile.accent);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-w * 0.13, 0);
      ctx.lineTo(0, h * 0.105);
      ctx.lineTo(w * 0.13, 0);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#111111';
      ctx.fillRect(w * 0.18, h * 0.18, w * 0.64, h * 0.018);
      ctx.globalAlpha = 1;
      break;
    case 'redBlack':
      ctx.fillStyle = hexCss(profile.trim ?? 0x17191d);
      ctx.fillRect(0, 0, w * 0.2, h);
      ctx.fillRect(w * 0.8, 0, w * 0.2, h);
      ctx.fillRect(0, 0, w, h * 0.1);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(w * 0.24, h * 0.19, w * 0.52, h * 0.028);
      ctx.fillRect(w * 0.18, h * 0.7, w * 0.64, h * 0.022);
      ctx.globalAlpha = 1;
      break;
    case 'sash':
      ctx.save();
      ctx.translate(w * 0.5, h * 0.48);
      ctx.rotate(-0.48);
      ctx.fillRect(-w, -h * 0.08, w * 2, h * 0.16);
      ctx.restore();
      break;
    case 'halves':
      ctx.fillRect(w * 0.5, 0, w * 0.5, h);
      break;
    case 'hoops':
      for (let y = h * 0.12; y < h; y += h * 0.22) ctx.fillRect(0, y, w, h * 0.09);
      break;
    case 'yoke':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w * 0.72, h * 0.33);
      ctx.quadraticCurveTo(w * 0.5, h * 0.42, w * 0.28, h * 0.33);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.globalAlpha = 0.22;
      ctx.fillRect(w * 0.11, h * 0.16, w * 0.78, h * 0.045);
      ctx.globalAlpha = 1;
      break;
  }

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffffff';
  for (let y = 14; y < h; y += 18) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = mixHex(profile.kit, 0x000000, 0.48);
  ctx.lineWidth = 8;
  drawKitShape(ctx, w, h);
  ctx.stroke();

  ctx.fillStyle = readableInk(profile.kit);
  ctx.font = '900 23px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (view === 'front') {
    ctx.fillText('DBH', w * 0.5, h * 0.36);
    ctx.fillStyle = hexCss(profile.accent);
    ctx.fillRect(w * 0.18, h * 0.24, w * 0.16, h * 0.08);
  } else {
    ctx.font = '900 19px "Arial Black", Impact, sans-serif';
    ctx.fillText(profile.name, w * 0.5, h * 0.23);
  }

  ctx.fillStyle = 'rgba(8, 12, 18, 0.45)';
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.04);
  ctx.lineTo(w * 0.5, h * 0.16);
  ctx.lineTo(w * 0.62, h * 0.04);
  ctx.lineTo(w * 0.56, h * 0.04);
  ctx.lineTo(w * 0.5, h * 0.1);
  ctx.lineTo(w * 0.44, h * 0.04);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function makeFaceTexture(profile: KickerVisualProfile): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for face');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(28, 22, 10, 6);
  ctx.fillRect(58, 22, 10, 6);

  const browTilt = profile.face === 'stern' ? 0.18 : profile.face === 'smile' ? -0.08 : 0.04;
  ctx.strokeStyle = '#1a130f';
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(23, 34 + browTilt * 30);
  ctx.lineTo(40, 32 - browTilt * 30);
  ctx.moveTo(56, 32 - browTilt * 30);
  ctx.lineTo(73, 34 + browTilt * 30);
  ctx.stroke();

  ctx.fillStyle = '#17120f';
  ctx.fillRect(29, 44, 9, 6);
  ctx.fillRect(59, 44, 9, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillRect(32, 44, 2, 2);
  ctx.fillRect(62, 44, 2, 2);

  ctx.strokeStyle = 'rgba(36, 22, 14, 0.52)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 51);
  ctx.lineTo(43, 67);
  ctx.lineTo(50, 70);
  ctx.stroke();

  ctx.strokeStyle = '#2a1710';
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (profile.face === 'smile') {
    ctx.arc(49, 78, 13, 0.12 * Math.PI, 0.88 * Math.PI);
  } else {
    ctx.moveTo(36, 80);
    ctx.lineTo(63, 80);
  }
  ctx.stroke();

  if (profile.beard || profile.face === 'bearded') {
    ctx.fillStyle = hexCss(profile.hair);
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(27, 72);
    ctx.quadraticCurveTo(48, 101, 70, 72);
    ctx.lineTo(65, 91);
    ctx.quadraticCurveTo(48, 112, 31, 91);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

interface KickerVisualProfile {
  number: string;
  name: string;
  kit: number;
  accent: number;
  trim?: number;
  sleeves?: number;
  shorts: number;
  shortTrim?: number;
  socks: number;
  sockBand?: number;
  boots: number;
  bootTrim?: number;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  beard?: boolean;
  scale: number;
  pattern: KitPattern;
  face: FaceMood;
  body: BodyPresetName;
}

const VISUAL_PROFILES: Record<string, KickerVisualProfile> = {
  // Diego: zurdo, melena rizada, celeste y blanca.
  diego: { number: '10', name: 'DIEGO', kit: 0xf5fbff, accent: 0x84bfe9, trim: 0xffffff, sleeves: 0xf5fbff, shorts: 0x11161d, shortTrim: 0x11161d, socks: 0xf2f4ef, sockBand: 0x84bfe9, boots: 0x0b0b0c, bootTrim: 0xe7d6b4, skin: 0xbd8258, hair: 0x241812, hairStyle: 'diegoCurls', scale: 0.99, pattern: 'argentina', face: 'stern', body: 'diego' },
  // David: diestro, curva clásica, blanco impecable.
  david: { number: '23', name: 'DAVID', kit: 0xf4efe7, accent: 0x8f2228, trim: 0x8f2228, sleeves: 0xf4efe7, shorts: 0x171719, shortTrim: 0x171719, socks: 0xf5f1e8, sockBand: 0x8f2228, boots: 0x0e0e0f, bootTrim: 0xd9c49b, skin: 0xd69b63, hair: 0xb98537, hairStyle: 'blondPart', scale: 1.02, pattern: 'whiteClassic', face: 'stern', body: 'david' },
  // Andrea: diestro, la caída, barba, azul.
  andrea: { number: '21', name: 'ANDREA', kit: 0x2a63c0, accent: 0xf2c33a, shorts: 0x132238, socks: 0xeaf1ff, boots: 0x0c0c10, skin: 0xd9aa7f, hair: 0x241a12, hairStyle: 'short', beard: true, scale: 1.0, pattern: 'yoke', face: 'bearded', body: 'engine' },
  // Dinho: diestro, vincha, alegría brasileña (amarillo/verde genérico).
  dinho: { number: '80', name: 'DINHO', kit: 0xf2c33a, accent: 0x1f9a4e, shorts: 0x12351f, socks: 0xfff0c2, boots: 0x101010, skin: 0x8d5a36, hair: 0x14100c, hairStyle: 'headband', scale: 1.03, pattern: 'sash', face: 'smile', body: 'artist' },
  // Leo: zurdo, finesse, azulgrana genérico.
  leo: { number: '30', name: 'LEO', kit: 0xf4f9fb, accent: 0x9ed1f1, trim: 0x5ea7d8, sleeves: 0xf4f9fb, shorts: 0x15181d, shortTrim: 0x77bce6, socks: 0xf5f3ee, sockBand: 0x8fc9e9, boots: 0x0e0e0f, bootTrim: 0xd9c49b, skin: 0xcf925b, hair: 0x2a1c12, hairStyle: 'texturedShort', beard: true, scale: 0.97, pattern: 'argentina', face: 'bearded', body: 'leo' },
  // Juni: diestro, knuckle, blanco y rojo.
  juni: { number: '8', name: 'JUNI', kit: 0xf3f3f3, accent: 0xd11f2d, shorts: 0xb31b27, socks: 0xf3f3f3, boots: 0x111111, skin: 0x8a5836, hair: 0x120e0a, hairStyle: 'short', scale: 1.0, pattern: 'sash', face: 'stern', body: 'balanced' },
  // Cris: diestro, knuckle moderno, postura ancha, rojo.
  cris: { number: '7', name: 'CRIS', kit: 0xcd252c, accent: 0x181a1f, trim: 0x181a1f, sleeves: 0x181a1f, shorts: 0x14161c, shortTrim: 0xcd252c, socks: 0xf2f0e8, sockBand: 0xb91f27, boots: 0x0b0b0d, bootTrim: 0xd9c49b, skin: 0xcf925b, hair: 0x171008, hairStyle: 'crisCut', scale: 1.05, pattern: 'redBlack', face: 'stern', body: 'cris' },
  // Roberto: zurdo, trivela de potencia, muslos enormes, amarillo.
  roberto: { number: '6', name: 'ROBERTO', kit: 0xf2c33a, accent: 0x1f9a4e, shorts: 0x12351f, socks: 0x1f9a4e, boots: 0x101010, skin: 0x7c4e2e, hair: 0x120d09, hairStyle: 'buzz', scale: 1.07, pattern: 'centerStripe', face: 'stern', body: 'stocky' },
  // Sini: zurdo, potencia pura, celeste italiano.
  sini: { number: '11', name: 'SINI', kit: 0x7fc6e8, accent: 0x14233a, shorts: 0x12161c, socks: 0xeaf6ff, boots: 0x0c0c10, skin: 0xe4ba90, hair: 0x3a2616, hairStyle: 'short', scale: 1.02, pattern: 'halves', face: 'classic', body: 'powerhouse' },
  // Pateador de entrenamiento (sandbox de QA).
  'training-right': { number: '7', name: 'RIVAS', kit: 0x79d7ff, accent: 0x053149, shorts: 0x071824, socks: 0xe8f8ff, boots: 0x0a1018, skin: 0xd3a06f, hair: 0x2a1a10, hairStyle: 'headband', scale: 0.97, pattern: 'hoops', face: 'classic', body: 'balanced' },
};

function visualProfileFor(kicker: Kicker): KickerVisualProfile {
  return VISUAL_PROFILES[kicker.id] ?? VISUAL_PROFILES.diego!;
}

function makeTaperedBox(
  topWidth: number,
  bottomWidth: number,
  height: number,
  topDepth: number,
  bottomDepth: number,
  material: THREE.Material,
): THREE.Mesh {
  const ty = height / 2;
  const by = -height / 2;
  const tw = topWidth / 2;
  const bw = bottomWidth / 2;
  const td = topDepth / 2;
  const bd = bottomDepth / 2;
  const vertices = new Float32Array([
    -bw, by, bd, bw, by, bd, bw, by, -bd, -bw, by, -bd,
    -tw, ty, td, tw, ty, td, tw, ty, -td, -tw, ty, -td,
  ]);
  const indices = [
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
    3, 2, 1, 3, 1, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function makeSegment(
  radius: number,
  length: number,
  material: THREE.Material,
  y: number,
  scale = new THREE.Vector3(1, 1, 1),
): THREE.Mesh {
  const capsuleLength = Math.max(0.01, length - radius * 2);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, capsuleLength, 3, 8), material);
  mesh.position.y = y;
  mesh.scale.copy(scale);
  return mesh;
}

const DEFAULT_BOOT_TRIM_MAT = makeCharacterMaterial(0xd6cbb8, 0.9);

function makeBoot(material: THREE.Material, trimMaterial: THREE.Material = DEFAULT_BOOT_TRIM_MAT): THREE.Group {
  const root = new THREE.Group();
  const upper = makeTaperedBox(0.09, 0.115, 0.06, 0.16, 0.22, material);
  upper.position.set(0, -0.017, -0.03);
  upper.rotation.x = -0.2;
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.095), material);
  toe.position.set(0, -0.02, -0.13);
  toe.rotation.x = -0.1;
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.018, 0.26),
    makeCharacterMaterial(0xc6b99f, 0.9),
  );
  sole.position.set(0, -0.058, -0.045);
  sole.rotation.x = -0.16;
  for (const x of [-0.036, 0, 0.036]) {
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.076), trimMaterial);
    lace.position.set(x, 0.012, -0.067);
    lace.rotation.set(-0.24, 0, x * -5.4);
    root.add(lace);
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.102, -0.068, -0.034]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.036, 0.006), trimMaterial);
      stripe.position.set(side * 0.063, -0.011, z);
      stripe.rotation.set(0.08, 0.2 * side, 0.36 * side);
      root.add(stripe);
    }
  }
  const studMat = makeCharacterMaterial(0xc9b98f, 0.92);
  for (const x of [-0.042, 0.042]) {
    for (const z of [-0.13, -0.015, 0.055]) {
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.012, 6), studMat);
      stud.position.set(x, -0.073, z);
      root.add(stud);
    }
  }
  root.add(upper, toe, sole);
  return root;
}

function makeHand(material: THREE.Material): THREE.Group {
  const root = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.DodecahedronGeometry(0.043, 0), material);
  palm.scale.set(0.78, 1.0, 0.62);
  root.add(palm);

  for (const x of [-0.018, 0.0, 0.018]) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.034, 0.012), material);
    finger.position.set(x, -0.039, 0.004);
    finger.rotation.z = x * -1.6;
    root.add(finger);
  }

  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.012), material);
  thumb.position.set(0.032, -0.012, 0.004);
  thumb.rotation.z = -0.75;
  root.add(thumb);
  return root;
}

function makeHead(skin: THREE.Material): THREE.Group {
  const root = new THREE.Group();
  const faceMat = new THREE.MeshBasicMaterial({ color: 0x17120f });
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), skin);
  head.scale.set(0.88, 1.08, 0.82);
  const leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skin);
  leftEar.position.set(-0.122, 0.0, 0.02);
  leftEar.scale.set(0.72, 1, 0.5);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.122;

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.026, 0.035), skin);
  nose.position.set(0, -0.005, 0.117);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), faceMat);
  leftEye.position.set(-0.042, 0.025, 0.119);
  leftEye.scale.set(1, 0.72, 0.42);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.042;

  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.006, 0.006), faceMat);
  leftBrow.position.set(-0.044, 0.052, 0.118);
  leftBrow.rotation.z = 0.16;
  const rightBrow = leftBrow.clone();
  rightBrow.position.x = 0.044;
  rightBrow.rotation.z = -0.16;

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.006, 0.006), faceMat);
  mouth.position.set(0, -0.052, 0.121);

  root.add(head, leftEar, rightEar, nose, leftEye, rightEye, leftBrow, rightBrow, mouth);
  return root;
}

export type HairStyle =
  | 'short'
  | 'buzz'
  | 'blondPart'
  | 'texturedShort'
  | 'crisCut'
  | 'curly'
  | 'diegoCurls'
  | 'afro'
  | 'headband'
  | 'ponytail'
  | 'bald';

const HEADBAND_MAT = new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.7 });

function makeHairClump(
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): THREE.Mesh {
  const clump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), material);
  clump.position.set(x, y, z);
  clump.scale.set(sx, sy, sz);
  return clump;
}

function makeHairCap(material: THREE.Material, y: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.145, 0), material);
  cap.position.set(0, y, -0.012);
  cap.scale.set(sx, sy, sz);
  return cap;
}

/** Peinado intercambiable, posicionado sobre una cabeza centrada en el origen. */
function makeHairstyle(style: HairStyle, hair: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const rH = 0.14;
  if (style === 'bald') return g;

  if (style === 'diegoCurls') {
    const crownGeo = new THREE.DodecahedronGeometry(0.041, 0);
    g.add(makeHairCap(hair, 0.065, 1.12, 0.62, 0.98));

    for (let i = 0; i < 24; i++) {
      const theta = (i / 24) * Math.PI * 2;
      const side = Math.abs(Math.cos(theta));
      const front = Math.max(0, Math.sin(theta));
      const back = Math.max(0, -Math.sin(theta));
      const curl = new THREE.Mesh(crownGeo, hair);
      curl.position.set(
        Math.cos(theta) * (0.108 + side * 0.022),
        0.05 + Math.sin(i * 1.73) * 0.012 - back * 0.022,
        Math.sin(theta) * (0.092 + back * 0.036) - 0.008 + front * 0.018,
      );
      curl.scale.set(1.0 + side * 0.22, 0.95 + back * 0.35, 0.95 + front * 0.12);
      g.add(curl);
    }

    const locks = [
      [-0.124, 0.015, 0.04, 0.72, 1.06, 0.72],
      [0.124, 0.015, 0.04, 0.72, 1.06, 0.72],
      [-0.105, -0.026, -0.032, 0.72, 1.2, 0.72],
      [0.105, -0.026, -0.032, 0.72, 1.2, 0.72],
      [-0.06, -0.038, -0.118, 0.66, 1.24, 0.72],
      [0.0, -0.052, -0.128, 0.72, 1.34, 0.78],
      [0.06, -0.038, -0.118, 0.66, 1.24, 0.72],
      [-0.058, 0.056, 0.098, 0.66, 0.8, 0.64],
      [0.02, 0.069, 0.106, 0.72, 0.78, 0.66],
      [0.082, 0.048, 0.092, 0.6, 0.74, 0.6],
    ] as const;
    for (const [x, y, z, sx, sy, sz] of locks) {
      g.add(makeHairClump(hair, x, y, z, sx, sy, sz));
    }
    return g;
  }

  if (style === 'curly' || style === 'afro') {
    const curlR = style === 'afro' ? 0.052 : 0.038;
    const spread = style === 'afro' ? 0.13 : 0.105;
    const count = style === 'afro' ? 16 : 10;
    const geo = new THREE.DodecahedronGeometry(curlR, 0);
    g.add(makeHairCap(hair, 0.058, style === 'afro' ? 1.16 : 1.02, style === 'afro' ? 0.68 : 0.48, 0.94));
    for (let i = 0; i < count; i++) {
      const phi = i * 2.39996; // ángulo áureo: distribución pareja
      const polar = (i / count) * Math.PI * 0.58; // de la coronilla hacia los lados
      const rad = Math.sin(polar) * spread;
      const curl = new THREE.Mesh(geo, hair);
      curl.position.set(
        Math.cos(phi) * rad,
        0.02 + Math.cos(polar) * (spread * 0.92),
        Math.sin(phi) * rad - 0.012,
      );
      g.add(curl);
    }
    return g;
  }

  if (style === 'blondPart') {
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(rH * 1.02, 0), hair);
    cap.position.set(0, 0.055, -0.01);
    cap.scale.set(0.98, 0.34, 0.84);
    g.add(cap);
    const sidePart = makeTaperedBox(0.18, 0.22, 0.055, 0.045, 0.07, hair);
    sidePart.position.set(-0.02, 0.102, 0.066);
    sidePart.rotation.set(0.34, -0.22, -0.08);
    g.add(sidePart);
    const quiff = makeTaperedBox(0.12, 0.18, 0.07, 0.045, 0.068, hair);
    quiff.position.set(0.052, 0.122, 0.09);
    quiff.rotation.set(0.48, -0.32, -0.24);
    g.add(quiff);
    g.add(makeHairClump(hair, -0.104, 0.018, -0.004, 0.44, 0.7, 0.42));
    g.add(makeHairClump(hair, 0.106, 0.016, -0.012, 0.38, 0.58, 0.38));
    return g;
  }

  if (style === 'texturedShort' || style === 'crisCut') {
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(rH, 0), hair);
    cap.position.set(0, 0.046, -0.011);
    cap.scale.set(style === 'crisCut' ? 0.9 : 0.96, style === 'crisCut' ? 0.28 : 0.34, 0.84);
    g.add(cap);
    const spikeCount = style === 'crisCut' ? 6 : 5;
    for (let i = 0; i < spikeCount; i++) {
      const x = (i - (spikeCount - 1) / 2) * 0.038;
      const spike = makeTaperedBox(0.038, 0.07, style === 'crisCut' ? 0.085 : 0.06, 0.035, 0.055, hair);
      spike.position.set(x, 0.1 + Math.abs(x) * -0.08, 0.082 - Math.abs(x) * 0.18);
      spike.rotation.set(0.5, x * -2.2, x * -1.8);
      g.add(spike);
    }
    if (style === 'texturedShort') {
      g.add(makeHairClump(hair, -0.103, 0.006, -0.006, 0.38, 0.6, 0.36));
      g.add(makeHairClump(hair, 0.103, 0.006, -0.006, 0.38, 0.6, 0.36));
    }
    return g;
  }

  // Casquete base (short / buzz / headband / ponytail).
  const flat = style === 'buzz' ? 0.2 : 0.36;
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(rH * 1.02, 0), hair);
  cap.position.set(0, 0.058, -0.008);
  cap.scale.set(0.96, flat, 0.88);
  g.add(cap);

  if (style === 'short') {
    const fringe = makeTaperedBox(0.15, 0.18, 0.04, 0.032, 0.055, hair);
    fringe.position.set(0.018, 0.087, 0.105);
    fringe.rotation.x = 0.38;
    g.add(fringe);
    g.add(makeHairClump(hair, -0.105, 0.008, -0.01, 0.42, 0.68, 0.42));
    g.add(makeHairClump(hair, 0.105, 0.008, -0.01, 0.42, 0.68, 0.42));
  }

  if (style === 'headband') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(rH * 1.0, 0.017, 8, 24), HEADBAND_MAT);
    band.position.set(0, 0.012, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.92, 0.6);
    g.add(band);
    const backLocks = [
      [-0.092, -0.032, -0.116, 0.54, 1.12, 0.48],
      [-0.03, -0.048, -0.13, 0.48, 1.3, 0.44],
      [0.035, -0.047, -0.128, 0.48, 1.26, 0.44],
      [0.094, -0.032, -0.116, 0.54, 1.12, 0.48],
    ] as const;
    for (const [x, y, z, sx, sy, sz] of backLocks) {
      g.add(makeHairClump(hair, x, y, z, sx, sy, sz));
    }
  }

  if (style === 'ponytail') {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.15, 5, 10), hair);
    tail.position.set(0, -0.01, -rH * 1.05);
    tail.rotation.x = 0.5;
    g.add(tail);
  }

  return g;
}

/** Barba corta alrededor del mentón (firma de Andrea). */
function makeBeard(hair: THREE.Material): THREE.Mesh {
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 12), hair);
  beard.scale.set(0.86, 0.62, 0.72);
  beard.position.set(0, -0.07, 0.018);
  return beard;
}

interface LegRig {
  root: THREE.Group;
  shin: THREE.Group;
}

interface ArmRig {
  root: THREE.Group;
  forearm: THREE.Group;
}

function buildLeg(
  x: number,
  shorts: THREE.Material,
  skin: THREE.Material,
  socks: THREE.Material,
  sockBand: THREE.Material,
  boots: THREE.Material,
  bootTrim: THREE.Material,
): LegRig {
  const root = new THREE.Group();
  root.position.set(x, 0.79, 0);

  const shortLeg = makeTaperedBox(0.13, 0.165, 0.19, 0.13, 0.17, shorts);
  shortLeg.position.y = -0.075;
  shortLeg.rotation.z = Math.sign(x || 1) * 0.035;
  const shortHem = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.022, 0.17), shorts);
  shortHem.position.y = -0.178;
  shortHem.rotation.z = shortLeg.rotation.z;
  const thigh = makeSegment(0.066, 0.27, skin, -0.292, new THREE.Vector3(1.2, 1, 1.0));
  const quad = new THREE.Mesh(new THREE.DodecahedronGeometry(0.047, 0), skin);
  quad.position.set(Math.sign(x || 1) * 0.026, -0.275, 0.047);
  quad.scale.set(0.88, 1.24, 0.54);
  const hamstring = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04, 0), skin);
  hamstring.position.set(Math.sign(x || 1) * -0.016, -0.3, -0.04);
  hamstring.scale.set(0.72, 1.12, 0.5);
  const knee = new THREE.Mesh(new THREE.DodecahedronGeometry(0.059, 0), skin);
  knee.position.y = -0.42;
  knee.scale.set(0.95, 0.82, 0.86);

  const shin = new THREE.Group();
  shin.position.y = -0.44;
  const calf = makeSegment(0.053, 0.34, socks, -0.22, new THREE.Vector3(0.92, 1, 0.86));
  const calfBulge = new THREE.Mesh(new THREE.DodecahedronGeometry(0.042, 0), socks);
  calfBulge.position.set(Math.sign(x || 1) * 0.018, -0.205, -0.035);
  calfBulge.scale.set(0.74, 1.25, 0.52);
  const sockHoop = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.026, 8), sockBand);
  sockHoop.position.y = -0.067;
  sockHoop.scale.set(1.04, 1, 0.86);
  const sockStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.052, 0.018, 8), sockBand);
  sockStripe.position.y = -0.12;
  sockStripe.scale.set(1.02, 1, 0.85);
  const boot = makeBoot(boots, bootTrim);
  boot.position.set(0, -0.44, -0.035);
  shin.add(sockHoop, sockStripe, calf, calfBulge, boot);

  root.add(shortLeg, shortHem, thigh, quad, hamstring, knee, shin);
  return { root, shin };
}

function buildArm(
  x: number,
  sleeve: THREE.Material,
  skin: THREE.Material,
): ArmRig {
  const root = new THREE.Group();
  root.position.set(x, 1.27, 0.012);
  const side = Math.sign(x || 1);

  const upper = makeSegment(0.044, 0.23, sleeve, -0.142, new THREE.Vector3(0.86, 1, 0.8));
  const bicep = new THREE.Mesh(new THREE.DodecahedronGeometry(0.034, 0), sleeve);
  bicep.position.set(side * 0.014, -0.145, 0.025);
  bicep.scale.set(0.72, 1.08, 0.56);
  const elbow = new THREE.Mesh(new THREE.DodecahedronGeometry(0.037, 0), skin);
  elbow.position.y = -0.285;

  const forearm = new THREE.Group();
  forearm.position.y = -0.29;
  const lower = makeSegment(0.033, 0.215, skin, -0.13, new THREE.Vector3(0.82, 1, 0.76));
  const forearmMass = new THREE.Mesh(new THREE.DodecahedronGeometry(0.028, 0), skin);
  forearmMass.position.set(side * 0.012, -0.12, 0.02);
  forearmMass.scale.set(0.68, 1.12, 0.5);
  const hand = makeHand(skin);
  hand.position.y = -0.27;
  forearm.add(lower, forearmMass, hand);

  root.add(upper, bicep, elbow, forearm);
  return { root, forearm };
}

function makeGroundShadow(width = 0.72, depth = 0.38): THREE.Mesh {
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 28),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.scale.set(width, depth, 1);
  shadowDisc.position.y = 0.018;
  shadowDisc.renderOrder = 1;
  return shadowDisc;
}

export class KickerActor {
  readonly group = new THREE.Group();

  private readonly torsoRoot = new THREE.Group();
  private readonly headRoot = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly kickLeg = new THREE.Group();
  private readonly kickShin = new THREE.Group();
  private readonly plantLeg = new THREE.Group();
  private readonly plantShin = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly leftForearm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly rightForearm = new THREE.Group();
  private readonly groundShadow = makeGroundShadow();
  private readonly kitMat: THREE.MeshStandardMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly skinMat = makeCharacterMaterial(0xba7a4d, 0.96);
  private readonly shortsMat = makeCharacterMaterial(0x10131b, 0.94);
  private readonly shortTrimMat = makeCharacterMaterial(0x10131b, 0.94);
  private readonly socksMat = makeCharacterMaterial(0xe8e1d3, 0.95);
  private readonly sockBandMat = makeCharacterMaterial(0xdad2c5, 0.94);
  private readonly bootsMat = makeCharacterMaterial(0x101010, 0.88);
  private readonly bootTrimMat = makeCharacterMaterial(0xd6cbb8, 0.9);
  private readonly sleeveMat = makeCharacterMaterial(0xd6bc48, 0.95);
  private readonly hairMat = makeCharacterMaterial(0x15110d, 0.97);
  private readonly hairGroup = new THREE.Group();
  private readonly kitDetails = new THREE.Group();
  private readonly frontKitPanel = makeTexturePanel(0.46, 0.56);
  private readonly backKitPanel = makeTexturePanel(0.46, 0.56);
  private readonly facePlate = makeTexturePanel(0.18, 0.22);
  private readonly frontNumber = makeKitNumber('10');
  private readonly backNumber = makeKitNumber('10');
  private readonly backName = makeKitName('DIEGO');
  private torsoMesh!: THREE.Mesh;
  private shouldersMesh!: THREE.Mesh;
  private shortsMesh!: THREE.Mesh;
  private waistbandMesh!: THREE.Mesh;
  private frontShortSeam!: THREE.Mesh;
  private backShortSeam!: THREE.Mesh;
  private leftShortTrim!: THREE.Mesh;
  private rightShortTrim!: THREE.Mesh;

  /** Pose de espera (varios pasos detras del balon) y de plantado (al contacto). */
  private readonly standPos = new THREE.Vector3();
  private readonly plantPos = new THREE.Vector3();
  private side = -1;
  private styleParams: StyleParams = KICK_STYLES.natural;

  constructor(scene: THREE.Scene) {
    this.kitMat = new THREE.MeshStandardMaterial({
      color: 0xf2d84a,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0x11141a,
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
    });
    this.build();
    scene.add(this.group);
  }

  setKicker(kicker: Kicker, ballPos: THREE.Vector3): void {
    const toGoal = new THREE.Vector3(-ballPos.x, 0, -ballPos.z).normalize();
    const back = toGoal.clone().multiplyScalar(-1);
    const right = new THREE.Vector3().crossVectors(toGoal, UP).normalize();
    this.side = kicker.foot === 'R' ? -1 : 1;
    this.styleParams = KICK_STYLES[kicker.style ?? 'natural'];

    this.standPos
      .copy(ballPos)
      .addScaledVector(back, this.styleParams.approach)
      .addScaledVector(right, this.styleParams.sideStand * this.side);
    this.standPos.y = 0;
    this.plantPos
      .copy(ballPos)
      .addScaledVector(back, this.styleParams.plantBack)
      .addScaledVector(right, 0.34 * this.side);
    this.plantPos.y = 0;

    this.group.position.copy(this.standPos);
    this.group.lookAt(ballPos.x, BALL_RADIUS, ballPos.z);
    this.applyVisualProfile(visualProfileFor(kicker));
    this.resetPose();
  }

  private applyVisualProfile(profile: KickerVisualProfile): void {
    this.kitMat.color.setHex(profile.kit);
    this.accentMat.color.setHex(profile.accent);
    this.sleeveMat.color.setHex(profile.sleeves ?? profile.kit);
    this.skinMat.color.setHex(profile.skin);
    this.shortsMat.color.setHex(profile.shorts);
    this.shortTrimMat.color.setHex(profile.shortTrim ?? profile.shorts);
    this.socksMat.color.setHex(profile.socks);
    this.sockBandMat.color.setHex(profile.sockBand ?? profile.accent);
    this.bootsMat.color.setHex(profile.boots);
    this.bootTrimMat.color.setHex(profile.bootTrim ?? 0xf1eee6);
    this.hairMat.color.setHex(profile.hair);
    this.group.scale.setScalar(profile.scale);
    const ink = readableInk(profile.kit);
    setPanelTexture(this.frontKitPanel, makeRetroKitTexture(profile, 'front'));
    setPanelTexture(this.backKitPanel, makeRetroKitTexture(profile, 'back'));
    setPanelTexture(this.facePlate, makeFaceTexture(profile));
    setTextMesh(this.frontNumber, makeKitNumberTexture(profile.number, ink));
    setTextMesh(this.backNumber, makeKitNumberTexture(profile.number, ink));
    setTextMesh(this.backName, makeKitTextTexture(profile.name, 256, 64, 38, ink));
    this.applyBodyPreset(BODY_PRESETS[profile.body]);
    this.configureKitDetails(profile);
    this.setHair(profile);
  }

  private applyBodyPreset(preset: BodyPreset): void {
    this.torsoMesh.scale.set(preset.torsoX, preset.torsoY, preset.torsoZ);
    this.shouldersMesh.scale.set(preset.shoulderX, 1, 1);
    this.shortsMesh.scale.set(preset.hipX, 1, 1);
    this.waistbandMesh.scale.set(preset.hipX, 1, 1);
    this.frontShortSeam.scale.set(1, 1, preset.hipX);
    this.backShortSeam.scale.set(1, 1, preset.hipX);
    this.leftShortTrim.position.x = -0.2 * preset.hipX;
    this.rightShortTrim.position.x = 0.2 * preset.hipX;
    this.kickLeg.position.x = 0.14 * this.side * preset.stance;
    this.plantLeg.position.x = -0.14 * this.side * preset.stance;
    this.kickLeg.scale.set(preset.legBulk, 1, preset.legBulk);
    this.plantLeg.scale.set(preset.legBulk, 1, preset.legBulk);
    this.leftArm.position.x = -0.27 * preset.shoulderX;
    this.rightArm.position.x = 0.27 * preset.shoulderX;
    this.leftArm.scale.set(preset.armBulk, 1, preset.armBulk);
    this.rightArm.scale.set(preset.armBulk, 1, preset.armBulk);
    this.headRoot.scale.setScalar(preset.head);
  }

  /** Reconstruye el peinado (y barba) según el perfil del pateador. */
  private setHair(profile: KickerVisualProfile): void {
    this.hairGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    this.hairGroup.clear();
    this.hairGroup.add(...makeHairstyle(profile.hairStyle, this.hairMat).children);
    if (profile.beard) this.hairGroup.add(makeBeard(this.hairMat));
  }

  private configureKitDetails(profile: KickerVisualProfile): void {
    this.kitDetails.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    this.kitDetails.clear();

    const geometryDriven = profile.pattern === 'argentina' || profile.pattern === 'whiteClassic' || profile.pattern === 'redBlack';
    this.frontKitPanel.visible = !geometryDriven;
    this.backKitPanel.visible = !geometryDriven;

    if (profile.pattern === 'argentina') {
      for (const x of [-0.13, 0.0, 0.13]) {
        this.addKitPlane(0.06, 0.48, x, 1.075, 0.148, this.accentMat);
        this.addKitPlane(0.06, 0.48, x, 1.075, -0.148, this.accentMat, true);
      }
      this.addVNeck(this.kitMat);
      this.addKitBox(0.28, 0.018, 0.012, 0, 1.345, 0.132, this.kitMat);
      this.addKitBox(0.28, 0.018, 0.012, 0, 1.345, -0.132, this.kitMat);
    } else if (profile.pattern === 'whiteClassic') {
      this.addVNeck(this.accentMat);
      this.addKitBox(0.14, 0.018, 0.014, -0.055, 1.315, 0.143, this.accentMat, 0, 0, -0.58);
      this.addKitBox(0.14, 0.018, 0.014, 0.055, 1.315, 0.143, this.accentMat, 0, 0, 0.58);
      this.addKitBox(0.42, 0.014, 0.014, 0, 1.255, 0.144, this.accentMat);
      this.addKitBox(0.42, 0.014, 0.014, 0, 1.255, -0.144, this.accentMat);
    } else if (profile.pattern === 'redBlack') {
      for (const x of [-0.2, 0.2]) {
        this.addKitPlane(0.065, 0.52, x, 1.075, 0.149, this.accentMat);
        this.addKitPlane(0.065, 0.52, x, 1.075, -0.149, this.accentMat, true);
      }
      this.addVNeck(this.accentMat);
      this.addKitBox(0.46, 0.028, 0.014, 0, 1.32, 0.144, this.accentMat);
      this.addKitBox(0.46, 0.028, 0.014, 0, 1.32, -0.144, this.accentMat);
    }
  }

  private addVNeck(material: THREE.Material): void {
    this.addKitBox(0.12, 0.018, 0.014, -0.04, 1.324, 0.151, material, 0, 0, -0.62);
    this.addKitBox(0.12, 0.018, 0.014, 0.04, 1.324, 0.151, material, 0, 0, 0.62);
    this.addKitBox(0.2, 0.016, 0.014, 0, 1.338, -0.151, material);
  }

  private addKitPlane(
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    back = false,
  ): void {
    const detail = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    detail.position.set(x, y, z);
    if (back) detail.rotation.y = Math.PI;
    detail.castShadow = true;
    this.kitDetails.add(detail);
  }

  private addKitBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    const detail = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    detail.position.set(x, y, z);
    detail.rotation.set(rx, ry, rz);
    detail.castShadow = true;
    this.kitDetails.add(detail);
  }

  private resetPose(): void {
    this.group.position.copy(this.standPos);
    this.group.position.y = 0;
    this.torsoRoot.rotation.set(0, 0, 0);
    this.headRoot.rotation.set(0, 0, 0);
    this.hips.rotation.set(0, 0, 0);
    this.kickLeg.rotation.set(0.06, 0, 0.04 * this.side);
    this.kickShin.rotation.set(-0.08, 0, 0);
    this.plantLeg.rotation.set(-0.04, 0, -0.02 * this.side);
    this.plantShin.rotation.set(-0.06, 0, 0);
    this.leftArm.rotation.set(-0.08, 0.02, -0.24);
    this.leftForearm.rotation.set(-0.22, 0, -0.08);
    this.rightArm.rotation.set(0.08, -0.02, 0.24);
    this.rightForearm.rotation.set(-0.22, 0, 0.08);
  }

  update(phase: ShotPhase, runupProgress: number): void {
    switch (phase) {
      case 'RUNUP':
        this.animateRunup(runupProgress);
        break;
      case 'FLIGHT':
      case 'RESULT':
        this.group.position.copy(this.plantPos);
        this.group.position.y = 0;
        this.torsoRoot.rotation.set(0.16, 0.22 * this.side, -0.08 * this.side);
        this.headRoot.rotation.set(-0.08, -0.16 * this.side, 0.03 * this.side);
        this.hips.rotation.set(0.08, 0.18 * this.side, 0.02 * this.side);
        this.kickLeg.rotation.set(-1.18, 0.08 * this.side, 0.34 * this.side);
        this.kickShin.rotation.set(0.34, 0, -0.06 * this.side);
        this.plantLeg.rotation.set(0.22, -0.04 * this.side, -0.12 * this.side);
        this.plantShin.rotation.set(-0.22, 0, 0.05 * this.side);
        this.leftArm.rotation.set(0.5, 0.06 * this.side, -0.62);
        this.leftForearm.rotation.set(-0.42, 0, -0.12);
        this.rightArm.rotation.set(-0.52, -0.06 * this.side, 0.58);
        this.rightForearm.rotation.set(-0.34, 0, 0.12);
        break;
      default:
        this.resetPose();
        break;
    }
  }

  /** Carrera: traslada de standPos a plantPos acelerando + zancadas + golpe. */
  private animateRunup(p: number): void {
    this.group.position.lerpVectors(this.standPos, this.plantPos, easeInQuad(p));

    const RUN_END = 0.62;
    if (p < RUN_END) {
      const stride = (p / RUN_END) * Math.PI * this.styleParams.strides;
      const s = Math.sin(stride);
      const bendKick = Math.max(0, -s);
      const bendPlant = Math.max(0, s);
      this.kickLeg.rotation.set(0.42 * s, 0, 0.04 * this.side);
      this.kickShin.rotation.set(-0.12 - 0.28 * bendKick, 0, 0);
      this.plantLeg.rotation.set(-0.42 * s, 0, -0.02 * this.side);
      this.plantShin.rotation.set(-0.12 - 0.28 * bendPlant, 0, 0);
        this.leftArm.rotation.set(-0.28 * s - 0.08, 0.02, -0.28);
        this.leftForearm.rotation.set(-0.22 - 0.18 * Math.max(0, s), 0, -0.08);
        this.rightArm.rotation.set(0.28 * s + 0.08, -0.02, 0.28);
        this.rightForearm.rotation.set(-0.22 - 0.18 * Math.max(0, -s), 0, 0.08);
      this.torsoRoot.rotation.set(-0.07, 0.04 * this.side * s, 0.02 * this.side * s);
      this.headRoot.rotation.set(0.025, -0.02 * this.side * s, 0);
      this.hips.rotation.set(-0.035, 0.04 * this.side * s, 0);
      this.group.position.y = Math.abs(Math.sin(stride)) * 0.032;
    } else {
      const q = (p - RUN_END) / (1 - RUN_END);
      this.group.position.y = 0;
      const windup = q < 0.34 ? q / 0.34 : 1;
      const strike = q < 0.34 ? 0 : (q - 0.34) / 0.66;
      const strikeEase = smoothstep(strike);
      const wPeak = this.styleParams.windupPeak;
      const swing =
        q < 0.34
          ? THREE.MathUtils.lerp(0.2, wPeak, windup)
          : THREE.MathUtils.lerp(wPeak, this.styleParams.swingPeak, strikeEase);
      const cross = Math.sin(strikeEase * Math.PI * 0.72) * this.side;
      this.kickLeg.rotation.set(swing, 0.08 * this.side * strikeEase, (0.08 + 0.24 * strikeEase) * this.side);
      this.kickShin.rotation.set(
        q < 0.34 ? THREE.MathUtils.lerp(-0.18, -0.52, windup) : THREE.MathUtils.lerp(-0.52, 0.3, strikeEase),
        // Giro del pie al contacto: interior (finesse) abre el tobillo; empeine (power) recto.
        this.styleParams.footTurn * this.side * strikeEase,
        -0.06 * cross,
      );
      this.plantLeg.rotation.set(0.18 - strikeEase * 0.02, -0.04 * this.side, -0.11 * this.side);
      this.plantShin.rotation.set(-0.2, 0, 0.04 * this.side);
      this.torsoRoot.rotation.set(
        THREE.MathUtils.lerp(-0.06, 0.18, strikeEase),
        0.22 * this.side * strikeEase,
        -0.08 * this.side * strikeEase,
      );
      this.headRoot.rotation.set(-0.08 * strikeEase, -0.16 * this.side * strikeEase, 0.03 * this.side * strikeEase);
      this.hips.rotation.set(0.08 * strikeEase, 0.2 * this.side * strikeEase, 0.02 * this.side * strikeEase);
      this.leftArm.rotation.set(0.54 * strikeEase, 0.04 * this.side, -0.34 - 0.28 * strikeEase);
      this.leftForearm.rotation.set(-0.24 - 0.22 * strikeEase, 0, -0.1 * strikeEase);
      this.rightArm.rotation.set(-0.54 * strikeEase, -0.04 * this.side, 0.34 + 0.24 * strikeEase);
      this.rightForearm.rotation.set(-0.2 - 0.16 * strikeEase, 0, 0.1 * strikeEase);
    }
  }

  private build(): void {
    const torso = makeTaperedBox(0.5, 0.38, 0.58, 0.2, 0.25, this.kitMat);
    torso.position.y = 1.065;
    this.torsoMesh = torso;

    const shoulders = makeTaperedBox(0.5, 0.44, 0.1, 0.21, 0.2, this.kitMat);
    shoulders.position.y = 1.32;
    this.shouldersMesh = shoulders;

    const chestBand = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.014), this.accentMat);
    chestBand.position.set(0, 1.16, 0.129);

    this.frontKitPanel.scale.set(1.1, 1.04, 1);
    this.backKitPanel.scale.set(1.1, 1.04, 1);
    this.frontKitPanel.position.set(0, 1.075, 0.136);
    this.backKitPanel.position.set(0, 1.075, -0.136);
    this.backKitPanel.rotation.y = Math.PI;

    this.frontNumber.position.set(0, 1.025, 0.154);
    this.backNumber.position.set(0, 1.025, -0.154);
    this.backNumber.rotation.y = Math.PI;
    this.backName.position.set(0, 1.235, -0.156);
    this.backName.rotation.y = Math.PI;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 12), this.skinMat);
    neck.position.y = 1.36;
    const head = makeHead(this.skinMat);
    this.headRoot.position.y = 1.51;
    this.facePlate.position.set(0, -0.005, 0.132);
    if (this.facePlate.material instanceof THREE.MeshBasicMaterial) this.facePlate.material.depthTest = true;
    this.headRoot.add(head, this.hairGroup, this.facePlate);

    const shortsMesh = makeTaperedBox(0.34, 0.28, 0.105, 0.2, 0.22, this.shortsMat);
    shortsMesh.position.y = 0.84;
    this.shortsMesh = shortsMesh;
    this.waistbandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.032, 0.24), this.shortTrimMat);
    this.waistbandMesh.position.set(0, 0.91, 0);
    this.frontShortSeam = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.105, 0.018), this.shortTrimMat);
    this.frontShortSeam.position.set(0, 0.785, 0.129);
    this.backShortSeam = this.frontShortSeam.clone();
    this.backShortSeam.position.z = -0.129;
    this.leftShortTrim = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.16, 0.018), this.shortTrimMat);
    this.leftShortTrim.position.set(-0.2, 0.79, 0.13);
    this.rightShortTrim = this.leftShortTrim.clone();
    this.rightShortTrim.position.x = 0.2;
    this.hips.add(
      shortsMesh,
      this.waistbandMesh,
      this.frontShortSeam,
      this.backShortSeam,
      this.leftShortTrim,
      this.rightShortTrim,
    );

    const kick = buildLeg(0.12, this.shortsMat, this.skinMat, this.socksMat, this.sockBandMat, this.bootsMat, this.bootTrimMat);
    this.kickLeg.add(...kick.root.children);
    this.kickLeg.position.copy(kick.root.position);
    this.kickShin.add(...kick.shin.children);
    this.kickShin.position.copy(kick.shin.position);
    this.kickLeg.add(this.kickShin);

    const plant = buildLeg(-0.12, this.shortsMat, this.skinMat, this.socksMat, this.sockBandMat, this.bootsMat, this.bootTrimMat);
    this.plantLeg.add(...plant.root.children);
    this.plantLeg.position.copy(plant.root.position);
    this.plantShin.add(...plant.shin.children);
    this.plantShin.position.copy(plant.shin.position);
    this.plantLeg.add(this.plantShin);

    const left = buildArm(-0.27, this.sleeveMat, this.skinMat);
    this.leftArm.add(...left.root.children);
    this.leftArm.position.copy(left.root.position);
    this.leftForearm.add(...left.forearm.children);
    this.leftForearm.position.copy(left.forearm.position);
    this.leftArm.add(this.leftForearm);

    const right = buildArm(0.27, this.sleeveMat, this.skinMat);
    this.rightArm.add(...right.root.children);
    this.rightArm.position.copy(right.root.position);
    this.rightForearm.add(...right.forearm.children);
    this.rightForearm.position.copy(right.forearm.position);
    this.rightArm.add(this.rightForearm);

    this.torsoRoot.add(
      shadow(torso),
      shadow(shoulders),
      shadow(chestBand),
      this.kitDetails,
      this.frontKitPanel,
      this.backKitPanel,
      this.frontNumber,
      this.backNumber,
      this.backName,
      shadow(neck),
      shadow(this.headRoot),
    );

    this.group.add(
      this.groundShadow,
      this.torsoRoot,
      shadow(this.hips),
      shadow(this.kickLeg),
      shadow(this.plantLeg),
      shadow(this.leftArm),
      shadow(this.rightArm),
    );
  }
}

export class GoalkeeperActor {
  readonly group = new THREE.Group();
  private readonly bodyRoot = new THREE.Group();
  private readonly keeperLeftLeg = new THREE.Group();
  private readonly keeperRightLeg = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly leftForearm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly rightForearm = new THREE.Group();
  private targetX = 0;
  private targetY = 0;
  private targetLean = 0;

  constructor(scene: THREE.Scene) {
    const keeperProfile: KickerVisualProfile = {
      number: '1',
      name: 'RUIZ',
      kit: 0xffcf3f,
      accent: 0x163d2f,
      shorts: 0x11151b,
      socks: 0xffcf3f,
      boots: 0x0d0f13,
      skin: 0xb9784c,
      hair: 0x16110d,
      hairStyle: 'short',
      scale: 1,
      pattern: 'yoke',
      face: 'stern',
      body: 'tower',
    };
    const kit = makeCharacterMaterial(keeperProfile.kit, 0.95);
    const trim = makeCharacterMaterial(keeperProfile.accent, 0.94);
    const dark = makeCharacterMaterial(keeperProfile.shorts, 0.95);
    const skin = makeCharacterMaterial(keeperProfile.skin, 0.96);
    const gloves = makeCharacterMaterial(0xdce8ef, 0.92);
    const boots = makeCharacterMaterial(keeperProfile.boots, 0.9);
    const hair = makeCharacterMaterial(keeperProfile.hair, 0.97);

    const body = makeTaperedBox(0.56, 0.42, 0.58, 0.22, 0.28, kit);
    body.position.y = 1.05;

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.075, 0.014), trim);
    chest.position.set(0, 1.13, 0.143);

    const keeperKit = makeTexturePanel(0.5, 0.58);
    keeperKit.position.set(0, 1.06, 0.154);
    setPanelTexture(keeperKit, makeRetroKitTexture(keeperProfile, 'front'));

    const keeperNumber = makeKitNumber(keeperProfile.number);
    keeperNumber.position.set(0, 1.0, 0.176);
    setTextMesh(keeperNumber, makeKitNumberTexture(keeperProfile.number, readableInk(keeperProfile.kit)));

    const head = makeHead(skin);
    head.position.y = 1.51;
    const gkHair = makeHairstyle('short', hair);
    gkHair.position.y = 1.51;
    const keeperFace = makeTexturePanel(0.18, 0.22);
    keeperFace.position.set(0, 1.505, 0.132);
    if (keeperFace.material instanceof THREE.MeshBasicMaterial) keeperFace.material.depthTest = true;
    setPanelTexture(keeperFace, makeFaceTexture(keeperProfile));

    const left = buildArm(-0.31, kit, gloves);
    this.leftArm.add(...left.root.children);
    this.leftArm.position.copy(left.root.position);
    this.leftForearm.add(...left.forearm.children);
    this.leftForearm.position.copy(left.forearm.position);
    this.leftArm.add(this.leftForearm);

    const right = buildArm(0.31, kit, gloves);
    this.rightArm.add(...right.root.children);
    this.rightArm.position.copy(right.root.position);
    this.rightForearm.add(...right.forearm.children);
    this.rightForearm.position.copy(right.forearm.position);
    this.rightArm.add(this.rightForearm);

    const leftLeg = buildLeg(-0.11, dark, dark, dark, dark, boots, gloves).root;
    const rightLeg = buildLeg(0.11, dark, dark, dark, dark, boots, gloves).root;
    this.keeperLeftLeg.add(...leftLeg.children);
    this.keeperLeftLeg.position.copy(leftLeg.position);
    this.keeperRightLeg.add(...rightLeg.children);
    this.keeperRightLeg.position.copy(rightLeg.position);

    const gloveHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.082, 18),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    gloveHalo.rotation.x = -Math.PI / 2;
    gloveHalo.position.y = 0.03;

    this.bodyRoot.add(
      shadow(body),
      shadow(chest),
      keeperKit,
      keeperNumber,
      shadow(head),
      shadow(gkHair),
      keeperFace,
      shadow(this.keeperLeftLeg),
      shadow(this.keeperRightLeg),
      shadow(this.leftArm),
      shadow(this.rightArm),
      gloveHalo,
    );

    this.group.position.set(0, 0, -0.18);
    this.group.add(makeGroundShadow(0.82, 0.42), this.bodyRoot);
    this.reset();
    scene.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  reset(): void {
    this.targetX = 0;
    this.targetY = 0;
    this.targetLean = 0;
    this.group.position.set(0, 0, -0.18);
    this.bodyRoot.rotation.set(0, 0, 0);
    this.keeperLeftLeg.rotation.set(-0.08, 0, -0.04);
    this.keeperRightLeg.rotation.set(-0.08, 0, 0.04);
    this.leftArm.position.y = 1.25;
    this.rightArm.position.y = 1.25;
    this.leftArm.rotation.set(0.08, 0, -1.05);
    this.leftForearm.rotation.set(-0.2, 0, 0);
    this.rightArm.rotation.set(0.08, 0, 1.05);
    this.rightForearm.rotation.set(-0.2, 0, 0);
  }

  trackCross(cross: { x: number; y: number } | null | undefined): void {
    this.targetX = THREE.MathUtils.clamp(cross?.x ?? 0, -1.25, 1.25);
  }

  /** Clavada: el arquero VUELA — despega del suelo, el torso gira a horizontal
   *  y los brazos se estiran hacia el balón. Cuanto más lejos/alto el tiro,
   *  más se estira (full extension) en vez de solo deslizarse. */
  diveTo(cross: { x: number; y: number }): void {
    this.targetX = THREE.MathUtils.clamp(cross.x, -2.7, 2.7);
    const side = Math.sign(this.targetX || 1);
    const reach = Math.abs(this.targetX);
    const high = cross.y > GOAL_HEIGHT * 0.52;

    // Despegue del suelo proporcional al estirón (tiros lejanos/altos = más vuelo).
    this.targetY = THREE.MathUtils.clamp((reach - 0.45) * 0.34 + (cross.y - 1.0) * 0.22, 0, 0.95);
    // Cuerpo a horizontal hacia el lado del envío.
    this.targetLean = -side * THREE.MathUtils.clamp(0.35 + reach * 0.45, 0, 1.4);

    // Piernas extendidas y juntas (postura de palomita).
    this.keeperLeftLeg.rotation.set(0.16, 0, -side * 0.12);
    this.keeperRightLeg.rotation.set(0.16, 0, -side * 0.12);
    // Brazos totalmente estirados hacia el balón.
    this.leftArm.rotation.set(high ? -0.18 : 0.1, 0, this.targetX < 0 ? -1.95 : -0.5);
    this.leftForearm.rotation.set(high ? -0.55 : -0.12, 0, 0);
    this.rightArm.rotation.set(high ? -0.18 : 0.1, 0, this.targetX > 0 ? 1.95 : 0.5);
    this.rightForearm.rotation.set(high ? -0.55 : -0.12, 0, 0);
    this.leftArm.position.y = high ? 1.42 : 1.2;
    this.rightArm.position.y = high ? 1.42 : 1.2;
  }

  update(dt: number): void {
    const alpha = 1 - Math.exp(-dt / 0.12); // respuesta más rápida (la clavada es explosiva)
    this.group.position.x += (this.targetX - this.group.position.x) * alpha;
    this.group.position.y += (this.targetY - this.group.position.y) * alpha;
    this.bodyRoot.rotation.z += (this.targetLean - this.bodyRoot.rotation.z) * alpha;
  }
}
