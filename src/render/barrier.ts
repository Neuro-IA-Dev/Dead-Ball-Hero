import * as THREE from 'three';
import type { BarrierColliderConfig } from '@/core/collisions';

const JUMP_DURATION_MS = 650;
const JUMP_PEAK_M = 0.55;

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function makeWallKitTexture(number: number, base: number, trim: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 176;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for wall kit');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = hexCss(base);
  ctx.fillRect(14, 6, 100, 160);
  ctx.fillStyle = hexCss(trim);
  ctx.fillRect(14, 6, 100, 24);
  if (number % 2 === 0) {
    ctx.fillRect(55, 6, 18, 160);
  } else {
    for (let y = 42; y < 160; y += 34) ctx.fillRect(14, y, 100, 10);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 7;
  ctx.strokeRect(14, 6, 100, 160);
  ctx.fillStyle = base > 0xb0b0b0 ? '#121722' : '#f8fbff';
  ctx.font = '900 54px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 101);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeWallFaceTexture(hair: number, mood: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 72;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for wall face');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#15110d';
  ctx.fillRect(21, 34, 8, 5);
  ctx.fillRect(44, 34, 8, 5);
  ctx.strokeStyle = hexCss(hair);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(16, 24 + mood);
  ctx.lineTo(32, 21 - mood);
  ctx.moveTo(40, 21 - mood);
  ctx.lineTo(56, 24 + mood);
  ctx.stroke();
  ctx.strokeStyle = '#2a1710';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(25, 60);
  ctx.lineTo(49, 60);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setIndex([
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
    3, 2, 1, 3, 1, 0,
  ]);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function makeWallMaterial(color: number, roughness = 0.94): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    flatShading: true,
  });
}

export class BarrierActor {
  readonly group = new THREE.Group();
  private roots: THREE.Group[] = [];
  private jumpMs = 0;

  private readonly kit = makeWallMaterial(0x2b67ff, 0.95);
  private readonly dark = makeWallMaterial(0x11151c, 0.96);
  private readonly skin = makeWallMaterial(0xc98b5a, 0.96);
  private readonly socks = makeWallMaterial(0xe7e1d6, 0.95);
  private readonly boots = makeWallMaterial(0x111111, 0.9);
  private readonly hair = makeWallMaterial(0x17120f, 0.97);
  private readonly marker = new THREE.MeshBasicMaterial({
    color: 0x9fffb8,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.group.visible = false;
  }

  setBarrier(barrier: BarrierColliderConfig | undefined, ballPos: THREE.Vector3): void {
    this.group.clear();
    this.roots = [];
    this.jumpMs = 0;
    this.group.visible = Boolean(barrier && barrier.players.length > 0);
    if (!barrier) return;

    for (let i = 0; i < barrier.players.length; i++) {
      const player = barrier.players[i]!;
      const actor = this.buildPlayer(player.radius, player.height, i);
      actor.position.set(player.x, 0, player.z);
      actor.lookAt(ballPos.x, 0.92, ballPos.z);
      this.group.add(actor);
      this.roots.push(actor);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible && this.group.children.length > 0;
  }

  /** Dispara el salto de la barrera (sincronizado al remate). */
  jump(): void {
    this.jumpMs = JUMP_DURATION_MS;
  }

  /** Vuelve a dejar a los jugadores en el suelo. */
  settle(): void {
    this.jumpMs = 0;
    for (const r of this.roots) r.position.y = 0;
  }

  update(dt: number): void {
    if (this.jumpMs <= 0) return;
    const t = 1 - this.jumpMs / JUMP_DURATION_MS; // 0..1
    const lift = Math.sin(Math.min(1, t) * Math.PI) * JUMP_PEAK_M;
    for (const r of this.roots) r.position.y = lift;
    this.jumpMs -= dt * 1000;
    if (this.jumpMs <= 0) for (const r of this.roots) r.position.y = 0;
  }

  private buildPlayer(radius: number, height: number, index: number): THREE.Group {
    const root = new THREE.Group();
    const bodyHeight = Math.max(0.68, height * 0.42);
    const legHeight = Math.max(0.56, height * 0.35);
    const headRadius = Math.min(0.14, radius * 0.5);
    const kitColors = [0x2b67ff, 0x2452c8, 0x1d8f5a, 0xd13d32, 0xe9e9e9];
    const trimColors = [0xffffff, 0xffd34a, 0x151922, 0x0c5b3a, 0x2b67ff];
    const skinColors = [0xe0b085, 0xc98b5a, 0x9a6747, 0x714733];
    const hairColors = [0x17120f, 0x402716, 0x6b4a2a, 0x0d0b08];
    const kitMat = this.kit.clone();
    const trimMat = this.dark.clone();
    const skinMat = this.skin.clone();
    const hairMat = this.hair.clone();
    kitMat.color.setHex(kitColors[index % kitColors.length]!);
    trimMat.color.setHex(trimColors[index % trimColors.length]!);
    skinMat.color.setHex(skinColors[index % skinColors.length]!);
    hairMat.color.setHex(hairColors[index % hairColors.length]!);

    const body = makeTaperedBox(radius * 1.34, radius * 0.98, bodyHeight * 0.72, radius * 0.62, radius * 0.72, kitMat);
    body.position.y = legHeight + bodyHeight * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;

    const chestStripe = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 1.12, 0.045, 0.01),
      trimMat,
    );
    chestStripe.position.set(0, legHeight + bodyHeight * 0.55, radius * 0.42);
    chestStripe.castShadow = true;

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(headRadius, 0), skinMat);
    head.position.y = Math.min(height - headRadius, legHeight + bodyHeight + headRadius * 1.2);
    head.scale.set(0.92, 1.05, 0.88);
    head.castShadow = true;

    const hairCap = new THREE.Mesh(new THREE.DodecahedronGeometry(headRadius * 1.01, 0), hairMat);
    hairCap.position.set(0, head.position.y + headRadius * 0.42, -headRadius * 0.06);
    hairCap.scale.set(0.96, 0.35, 0.88);
    hairCap.castShadow = true;

    const shorts = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 1.2, 0.15, radius * 0.62),
      trimMat,
    );
    shorts.position.y = legHeight + 0.06;
    shorts.castShadow = true;

    const legGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.19, legHeight, 10);
    const leftLeg = new THREE.Mesh(legGeo, this.socks);
    leftLeg.position.set(-radius * 0.3, legHeight * 0.5, 0);
    leftLeg.castShadow = true;
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = radius * 0.3;

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.42, 0.05, radius * 0.78), this.boots);
    leftBoot.position.set(-radius * 0.3, 0.035, -radius * 0.1);
    const rightBoot = leftBoot.clone();
    rightBoot.position.x = radius * 0.3;

    const armGeo = new THREE.CylinderGeometry(radius * 0.11, radius * 0.13, bodyHeight * 0.46, 10);
    const leftArm = new THREE.Mesh(armGeo, kitMat);
    leftArm.position.set(-radius * 0.42, legHeight + bodyHeight * 0.58, radius * 0.36);
    leftArm.rotation.z = -0.88;
    leftArm.rotation.x = -0.15;
    leftArm.castShadow = true;
    const rightArm = leftArm.clone();
    rightArm.position.x = radius * 0.42;
    rightArm.rotation.z = 0.88;

    const forearmGeo = new THREE.CylinderGeometry(radius * 0.1, radius * 0.12, bodyHeight * 0.42, 10);
    const leftForearm = new THREE.Mesh(forearmGeo, skinMat);
    leftForearm.position.set(-radius * 0.18, legHeight + bodyHeight * 0.42, radius * 0.52);
    leftForearm.rotation.z = 0.74;
    leftForearm.rotation.x = -0.2;
    leftForearm.castShadow = true;
    const rightForearm = leftForearm.clone();
    rightForearm.position.x = radius * 0.18;
    rightForearm.rotation.z = -0.74;

    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.16, 10, 8), skinMat);
    leftHand.position.set(-radius * 0.05, legHeight + bodyHeight * 0.3, radius * 0.6);
    const rightHand = leftHand.clone();
    rightHand.position.x = radius * 0.05;

    const footprint = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius + 0.07, 24),
      this.marker,
    );
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.y = 0.012;
    footprint.renderOrder = 2;

    const kitPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 1.12, bodyHeight * 0.76),
      new THREE.MeshBasicMaterial({
        map: makeWallKitTexture(2 + index, kitMat.color.getHex(), trimMat.color.getHex()),
        alphaTest: 0.12,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        toneMapped: false,
      }),
    );
    kitPanel.position.set(0, legHeight + bodyHeight * 0.54, radius * 0.45);
    kitPanel.renderOrder = 10;

    const facePanel = new THREE.Mesh(
      new THREE.PlaneGeometry(headRadius * 1.15, headRadius * 1.42),
      new THREE.MeshBasicMaterial({
        map: makeWallFaceTexture(hairMat.color.getHex(), index % 2 === 0 ? 2 : -1),
        alphaTest: 0.08,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        toneMapped: false,
      }),
    );
    facePanel.position.set(0, head.position.y - headRadius * 0.06, headRadius * 0.88);
    facePanel.renderOrder = 11;

    root.add(
      footprint,
      body,
      chestStripe,
      kitPanel,
      shorts,
      head,
      hairCap,
      facePanel,
      leftLeg,
      rightLeg,
      leftBoot,
      rightBoot,
      leftArm,
      rightArm,
      leftForearm,
      rightForearm,
      leftHand,
      rightHand,
    );
    return root;
  }
}
